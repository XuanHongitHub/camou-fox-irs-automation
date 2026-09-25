from __future__ import annotations

from dataclasses import replace
import logging
import os
import json
import shutil
import time
import multiprocessing as mp
import traceback
import threading
from pathlib import Path
from typing import Any, Dict, Set, Tuple

from .config import AppConfig, load_config
from .logging_utils import jsonl_append, utc_now
from .models import JobResult, JobStatus
from .proxyxoay_client import ProxyXoayClient
from .queueing import update_job_status
from .queueing import update_job_status_and_queue
from .runner import (
    pick_proxy_vm,
    resolve_proxy_endpoint,
    rotate_proxy_ip,
    rotate_runtime_ip,
    run_single_attempt,
)
from .storage import append_result_row, write_json, update_batch_manifest

logger = logging.getLogger(__name__)
_RUNTIME_ROTATE_LOCK = threading.Lock()
_RUNTIME_ROTATE_LAST_AT = 0.0
_RUNTIME_LIST_PICK_LOCK = threading.Lock()
_RUNTIME_LIST_CURSOR = 0
_RUNTIME_LIST_LAST_USED_AT: Dict[str, float] = {}

GLOBAL_WORKER_STOP_EVENT = threading.Event()
_CONSECUTIVE_DAILY_LIMIT_LOCK = threading.Lock()
_CONSECUTIVE_DAILY_LIMIT_HITS = 0
MAX_CONSECUTIVE_DAILY_LIMITS = 3


def is_irs_operational_hours() -> Tuple[bool, str]:
    """Check if current time is within IRS EIN online operating window:
    Monday through Friday from 7:00 a.m. to 10:00 p.m. Eastern Time.
    Returns (is_open, human_reason).
    """
    from datetime import datetime, timezone, timedelta
    try:
        import zoneinfo
        et_tz = zoneinfo.ZoneInfo("America/New_York")
        now_et = datetime.now(et_tz)
    except Exception:
        # Fallback to EDT (UTC-4) / EST (UTC-5)
        now_et = datetime.now(timezone(timedelta(hours=-4)))
    
    weekday = now_et.weekday()  # 0 = Monday, 6 = Sunday
    hour = now_et.hour
    minute = now_et.minute
    time_str = f"{now_et.strftime('%A')} {hour:02d}:{minute:02d} ET"
    if weekday > 4:
        return False, f"Weekend closed ({time_str})"
    if hour < 7 or hour >= 22:
        return False, f"Outside daily window 7 a.m. - 10 p.m. ET ({time_str})"
    return True, f"Open ({time_str})"


def _is_offline_apply_error(step: str, message: str) -> bool:
    text = f"{step} {message}".lower()
    return any(token in text for token in [
        "operational hours",
        "technical difficulties",
        "service is unavailable",
        "system is currently unavailable",
        "system is down",
        "temporarily unavailable due to maintenance",
        "maintenance window",
    ])


def _is_daily_limit_error(step: str, message: str) -> bool:
    text = f"{step} {message}".lower()
    return any(token in text for token in [
        "irs_daily_limit",
        "attempted too many requests for today",
        "too many requests for today",
        "one (1) ein per business day",
        "daily ein limit reached",
        "limit reached: attempted too many",
    ])



def _bad_proxy_path(config: AppConfig) -> Path:
    return Path(config.output.state_dir) / "bad_proxies.json"


def _load_bad_proxy_codes(config: AppConfig) -> Set[str]:
    path = _bad_proxy_path(config)
    if not path.exists():
        return set()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        items = payload.get("proxy_codes") if isinstance(payload, dict) else []
        if not isinstance(items, list):
            return set()
        return {str(x).strip() for x in items if str(x).strip()}
    except Exception:
        return set()


def _ban_proxy_code(config: AppConfig, proxy_code: str, reason: str) -> None:
    code = str(proxy_code or "").strip()
    if not code:
        return
    path = _bad_proxy_path(config)
    current = _load_bad_proxy_codes(config)
    if code in current:
        return
    current.add(code)
    payload = {
        "proxy_codes": sorted(current),
        "updated_at": utc_now(),
        "last_ban_reason": reason,
    }
    write_json(path, payload)


def emit_event(event_type: str, **kwargs) -> None:
    """Emit a structured JSON event to stdout for the Electron main process to parse.
    Lines prefixed with EVENT:: are not treated as plain logs."""
    import sys
    payload = {"event": event_type, **kwargs}
    print(f"EVENT::{json.dumps(payload, ensure_ascii=True, default=str)}", flush=True)


def _prepare_final_bundle(
    artifact_dir: Path,
    *,
    batch_id: str,
    record_id: str,
    record_name: str,
    status: JobStatus,
    confirmation_number: str,
    step6_ein: str,
    step6_legal_name: str,
    step6_data: Dict[str, Any],
    pdf_path: str,
    proxy_code: str,
    proxy_ip: str,
) -> str:
    def _pdf_escape(s: str) -> str:
        return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    def _write_simple_pdf(path: Path, lines: list[str]) -> None:
        # Minimal single-page PDF writer (no external dependency).
        page_w, page_h = 612, 792  # Letter
        y = 760
        content_lines = ["BT", "/F1 11 Tf", "72 760 Td"]
        first = True
        for raw in lines[:120]:
            text = _pdf_escape(raw)
            if first:
                content_lines.append(f"({text}) Tj")
                first = False
            else:
                y -= 14
                if y < 60:
                    break
                content_lines.append("0 -14 Td")
                content_lines.append(f"({text}) Tj")
        content_lines.append("ET")
        stream = "\n".join(content_lines).encode("utf-8")

        objects: list[bytes] = []
        objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
        objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_w} {page_h}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".encode("ascii"))
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream")

        blob = bytearray()
        blob.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        xref_offsets = [0]
        for idx, obj in enumerate(objects, start=1):
            xref_offsets.append(len(blob))
            blob.extend(f"{idx} 0 obj\n".encode("ascii"))
            blob.extend(obj)
            blob.extend(b"\nendobj\n")
        xref_start = len(blob)
        blob.extend(f"xref\n0 {len(xref_offsets)}\n".encode("ascii"))
        blob.extend(b"0000000000 65535 f \n")
        for off in xref_offsets[1:]:
            blob.extend(f"{off:010d} 00000 n \n".encode("ascii"))
        blob.extend(f"trailer\n<< /Size {len(xref_offsets)} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n".encode("ascii"))
        path.write_bytes(bytes(blob))

    # Keep operator-facing outputs in one place (record artifact root),
    # instead of splitting into a separate `final/` subfolder.
    final_dir = artifact_dir
    final_dir.mkdir(parents=True, exist_ok=True)

    final_pdf_path = ""
    src_pdf = Path(pdf_path) if pdf_path else None
    if src_pdf and src_pdf.exists():
        safe_record = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in record_id)[:64]
        safe_ein = (step6_ein or confirmation_number or "no_ein").replace("-", "")
        target_name = f"{safe_record}_{safe_ein}_CP575.pdf"
        target = final_dir / target_name
        try:
            shutil.copy2(str(src_pdf), str(target))
            final_pdf_path = str(target)
        except Exception:
            final_pdf_path = str(src_pdf)

    # Fallback: always generate a final PDF summary when download is missing.
    if not final_pdf_path:
        safe_record = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in record_id)[:64]
        safe_ein = (step6_ein or confirmation_number or "no_ein").replace("-", "")
        target = final_dir / f"{safe_record}_{safe_ein}_SUMMARY.pdf"
        lines = [
            "IRS EIN Confirmation Summary (Automation Fallback)",
            "",
            f"Batch ID: {batch_id}",
            f"Record ID: {record_id}",
            f"Record Name: {record_name}",
            f"Status: {status.value}",
            f"EIN: {step6_ein or confirmation_number or ''}",
            f"Legal Name: {step6_legal_name or ''}",
            f"Name Control: {step6_data.get('step6_name_control', '')}",
            f"County: {step6_data.get('step6_county', '')}",
            f"State: {step6_data.get('step6_state', '')}",
            f"Start Date: {step6_data.get('step6_start_date', '')}",
            f"Phone: {step6_data.get('step6_phone_number', '')}",
            f"Activity: {step6_data.get('step6_principal_activity', '')}",
            f"Product/Service: {step6_data.get('step6_principal_product_service', '')}",
            f"Reason Applying: {step6_data.get('step6_reason_for_applying', '')}",
            f"Proxy Code: {proxy_code}",
            f"Proxy IP: {proxy_ip}",
            "",
            f"Generated at: {utc_now()}",
        ]
        try:
            _write_simple_pdf(target, lines)
            final_pdf_path = str(target)
        except Exception:
            final_pdf_path = ""

    summary = {
        "batch_id": batch_id,
        "record_id": record_id,
        "record_name": record_name,
        "status": status.value,
        "step6_ein": step6_ein or confirmation_number,
        "step6_legal_name": step6_legal_name,
        "step6_data": step6_data,
        "proxy_code": proxy_code,
        "proxy_ip": proxy_ip,
        "final_pdf_path": final_pdf_path,
    }
    write_json(final_dir / "step6.json", summary)
    return final_pdf_path


def _classify_error_type(step: str, message: str, status: JobStatus) -> str:
    if status == JobStatus.SUCCESS:
        return ""
    if status == JobStatus.VALIDATION_FAILED:
        return "validation"
    text = f"{step} {message}".lower()
    if any(k in text for k in [
        "irs_daily_limit",
        "irs_hard_fail",
        "irs ssn rule hit",
        "attempted too many requests for today",
        "one (1) ein per business day",
        "unable to provide you with an ein",
        "cannot provide you with an ein online",
        "unable to provide you with an ein through this online assistant",
        "unable to complete",
        "reference number: 101",
        "reference number: 115",
        "form ss-4",
        "form ss 4",
        "must submit a form ss-4",
        "submit a form ss-4",
        "by fax or mail",
        "ssn has already",
        "ssn/itin has already",
        "already assigned an ein",
        "already has an ein",
        "already associated with an ein",
        "existing ein",
        "already been used for ein registration",
        "ssn can only be used once",
        "ssn/itin can only be used once",
    ]):
        return "business_rule"
    if any(k in text for k in [
        "blocked",
        "captcha",
        "verify you are human",
        "access denied",
        "cloudflare",
        "challenge",
        "429",
        "403",
    ]):
        return "blocked"
    if any(k in text for k in [
        "proxy_rotate",
        "proxy_healthcheck",
        "rotate failed",
        "could not connect to proxy",
        "ns_error_proxy_connection_refused",
        "proxyerror",
        "tunnel connection failed",
    ]):
        return "proxy"
    return "automation"


def _is_non_retryable_business_rule(step: str, message: str) -> bool:
    text = f"{step} {message}".lower()
    if _is_offline_apply_error(step, message) or _is_daily_limit_error(step, message):
        return False
    return any(token in text for token in [
        "irs ssn rule hit",
        "unable to provide you with an ein",
        "cannot provide you with an ein online",
        "unable to provide you with an ein through this online assistant",
        "unable to complete",
        "reference number: 101",
        "reference number: 115",
        "reference 101",
        "reference 115",
        "ssn has already",
        "ssn/itin has already",
        "already assigned an ein",
        "already has an ein",
        "already associated with an ein",
        "existing ein",
        "already been used for ein registration",
        "ssn can only be used once",
        "ssn/itin can only be used once",
    ])


def _is_non_retryable_validation_failure(step: str, message: str) -> bool:
    text = f"{step} {message}".lower()
    return any(token in text for token in [
        "validation failed",
        "is required",
        "invalid",
        "not permitted",
        "not allowed",
        "po boxes are not permitted",
        "p.o. boxes are not permitted",
        "p o boxes are not permitted",
        "physical address",
        "street:",
        "street address",
        "county name",
        "only special characters allowed",
        "responsible party",
        "invalid ssn",
        "invalid zip",
        "invalid bang/state",
        "missing name",
        "missing address",
        "missing citi",
    ])


def _is_transient_retryable(step: str, message: str) -> bool:
    text = f"{step} {message}".lower()
    return any(token in text for token in [
        "timeout",
        "timed out",
        "cannot find continue button",
        "cannot find submit ein request button",
        "cannot select option",
        "cannot find",
        "download button not clickable",
        "target closed",
        "net::",
        "ns_error_proxy_connection_refused",
        "navigation",
        "context closed",
        "page closed",
        "connection reset",
        "connection aborted",
        "connection refused",
        "502",
        "503",
        "504",
        "temporarily unavailable",
    ])


def _should_ban_proxy(step: str, message: str) -> bool:
    text = f"{step} {message}".lower()
    return any(token in text for token in [
        "proxy_healthcheck",
        "could not connect to proxy",
        "ns_error_proxy_connection_refused",
        "proxyerror",
        "tunnel connection failed",
        "407",
        "connection refused",
        "connection reset",
        "proxy rotate",
        "rotate failed",
    ])


def _retry_backoff_seconds(base_backoff_seconds: int, attempt: int) -> int:
    base = max(0, int(base_backoff_seconds))
    if base == 0:
        return 0
    return base * max(1, int(attempt))


def _rotate_runtime_ip_staggered(rotate_url: str, wait_seconds: int) -> Any:
    global _RUNTIME_ROTATE_LAST_AT
    gap = max(0, int(wait_seconds or 0))
    with _RUNTIME_ROTATE_LOCK:
        if gap > 0:
            elapsed = time.time() - float(_RUNTIME_ROTATE_LAST_AT or 0.0)
            sleep_for = gap - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)
        result = rotate_runtime_ip(rotate_url, wait_seconds=wait_seconds)
        _RUNTIME_ROTATE_LAST_AT = time.time()
        return result


def _runtime_list_key(proxy_item: Dict[str, Any]) -> str:
    host = str(proxy_item.get("host", "")).strip()
    port = int(proxy_item.get("port", 0) or 0)
    user = str(proxy_item.get("username", "")).strip()
    return f"{host}:{port}:{user}"


def _pick_runtime_list_proxy_staggered(config: AppConfig) -> Tuple[Dict[str, Any], float]:
    """
    Pick one proxy from runtime proxy_list with round-robin fairness and per-proxy cooldown.
    Returns (proxy_item, waited_seconds).
    """
    global _RUNTIME_LIST_CURSOR
    candidates = []
    for item in list(getattr(config.proxy_runtime, "proxy_list", []) or []):
        if not isinstance(item, dict):
            continue
        if not bool(item.get("enabled", True)):
            continue
        host = str(item.get("host", "")).strip()
        if not host:
            continue
        try:
            port = int(item.get("port", 0) or 0)
        except Exception:
            port = 0
        if port <= 0:
            continue
        candidates.append(
            {
                "host": host,
                "port": port,
                "username": str(item.get("username", "") or ""),
                "password": str(item.get("password", "") or ""),
            }
        )
    if not candidates:
        raise RuntimeError("proxy_runtime.proxy_list is empty or invalid")

    cooldown = max(0, int(getattr(config.proxy_runtime, "change_ip_wait_seconds", 0) or 0))

    with _RUNTIME_LIST_PICK_LOCK:
        now = time.time()
        n = len(candidates)
        start_idx = _RUNTIME_LIST_CURSOR % n

        # Try immediate ready proxy first.
        for offset in range(n):
            idx = (start_idx + offset) % n
            item = candidates[idx]
            key = _runtime_list_key(item)
            last_at = float(_RUNTIME_LIST_LAST_USED_AT.get(key, 0.0) or 0.0)
            if cooldown <= 0 or (now - last_at) >= cooldown:
                _RUNTIME_LIST_CURSOR = idx + 1
                _RUNTIME_LIST_LAST_USED_AT[key] = now
                return item, 0.0

        # None ready: pick earliest available and wait.
        best_idx = start_idx
        best_wait = None
        for offset in range(n):
            idx = (start_idx + offset) % n
            item = candidates[idx]
            key = _runtime_list_key(item)
            last_at = float(_RUNTIME_LIST_LAST_USED_AT.get(key, 0.0) or 0.0)
            wait_for = max(0.0, float(cooldown) - (now - last_at))
            if best_wait is None or wait_for < best_wait:
                best_wait = wait_for
                best_idx = idx
        wait_for = float(best_wait or 0.0)
        if wait_for > 0:
            time.sleep(wait_for)
        picked = candidates[best_idx]
        _RUNTIME_LIST_CURSOR = best_idx + 1
        _RUNTIME_LIST_LAST_USED_AT[_runtime_list_key(picked)] = time.time()
        return picked, wait_for


def _is_known_retryable_failure(step: str, message: str) -> bool:
    text = f"{step} {message}".lower()
    if _is_transient_retryable(step, message):
        return True
    return any(token in text for token in [
        "proxy_rotate",
        "proxy_healthcheck",
        "rotate failed",
        "could not connect to proxy",
        "ns_error_proxy_connection_refused",
        "proxyerror",
        "tunnel connection failed",
        "connection refused",
        "connection reset",
        "connection aborted",
        "navigation",
        "net::",
        "target closed",
        "context closed",
        "page closed",
        "temporarily unavailable",
        "download button not clickable",
    ])


def _is_system_environment_error(step: str, message: str) -> bool:
    text = f"{step} {message}".lower()
    return any(token in text for token in [
        "notinstalledgeoipextra",
        "filenotfounderror",
        "no such file or directory",
        "no space left on device",
        "modulenotfounderror",
        "importerror",
        "executable doesn't exist",
        "failed to launch browser",
        "failed to open target file",
        "decompression resulted in return code",
        "failed to create parent directory structure",
        "cannot find module",
        "memoryerror",
        "pyi-",
    ])


def _run_single_attempt_with_timeout(
    *,
    config: AppConfig,
    record: Dict[str, Any],
    proxy_endpoint: Any,
    artifact_dir: Path,
    use_proxy: bool,
    timeout_seconds: int = 240,
    step_callback: Any = None,
) -> Tuple[JobStatus, str, str, str, Dict[str, str]]:
    try:
        return run_single_attempt(
            config=config,
            record=record,
            proxy_endpoint=proxy_endpoint,
            artifact_dir=artifact_dir,
            use_proxy=use_proxy,
            step_callback=step_callback,
        )
    except Exception as exc:
        logger.exception("run_single_attempt raised unhandled exception")
        return JobStatus.RETRYABLE_FAIL, "runtime", str(exc), "", {}


def _relocate_artifacts_by_status(config: AppConfig, batch_id: str, record_id: str, status: JobStatus, artifact_dir: Path) -> Path:
    bucket = "__confirmed" if status == JobStatus.SUCCESS else "__failed"
    target = Path(config.output.artifacts_dir) / batch_id / bucket / record_id
    if artifact_dir == target:
        return artifact_dir
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    shutil.move(str(artifact_dir), str(target))
    return target


def _remap_path(old_base: Path, new_base: Path, value: str) -> str:
    if not value:
        return value
    old_str = str(old_base)
    new_str = str(new_base)
    if value.startswith(old_str):
        return new_str + value[len(old_str):]
    return value


def _prune_debug_artifacts(artifact_dir: Path) -> None:
    """Keep only minimal operator-facing outputs."""
    keep_names = {"result.json", "step6.json"}
    for child in artifact_dir.iterdir():
        if child.name in keep_names:
            continue
        if child.is_file() and child.suffix.lower() == ".pdf":
            continue
        try:
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                child.unlink(missing_ok=True)
        except Exception:
            # best effort cleanup
            pass


def _compact_step6_data(step6: Dict[str, Any]) -> Dict[str, Any]:
    """Keep parsed fields compact for CSV/report usage."""
    if not isinstance(step6, dict):
        return {}
    out = dict(step6)
    out.pop("step6_raw_text", None)
    return out



def _load_app_config() -> AppConfig:
    config_path = os.getenv("IRS_BOT_CONFIG", "irs_bot/config.yml")
    return load_config(config_path)



def process_record_job(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    RQ entrypoint. Expected payload:
    {
      "batch_id": str,
      "source_file": str,
      "record": dict
    }
    """
    config = _load_app_config()
    raw_job = dict(payload or {})
    queue_job_id = str(raw_job.get("job_id", "") or "").strip()
    queue_name = str(raw_job.get("queue_name", "") or "").strip()
    core_payload: Dict[str, Any]
    if isinstance(raw_job.get("payload"), dict):
        core_payload = dict(raw_job.get("payload") or {})
    else:
        core_payload = raw_job

    sandbox_mode = bool(core_payload.get("sandbox"))
    observe_mode = bool(core_payload.get("observe"))
    if observe_mode:
        config = replace(
            config,
            browser=replace(
                config.browser,
                observe_mode_active=True,
                step_delay_ms=max(
                    config.browser.observe_min_delay_ms,
                    config.browser.step_delay_ms + config.browser.observe_extra_delay_ms,
                    int(config.browser.step_delay_ms * config.browser.observe_step_delay_multiplier),
                ),
                step_delay_jitter_ms=max(
                    config.browser.observe_min_jitter_ms,
                    config.browser.step_delay_jitter_ms,
                    int(config.browser.step_delay_jitter_ms * config.browser.observe_step_delay_multiplier),
                ),
                observe_disable_ready_speedup=True,
            ),
        )

    batch_id = str(core_payload["batch_id"])
    source_file = str(core_payload["source_file"])
    record = dict(core_payload["record"])
    record_id = str(record.get("record_id", "")).strip()
    if not record_id:
        raise ValueError("record_id is required")
    if not queue_job_id:
        queue_job_id = f"{batch_id}:{record_id}"

    started_at = utc_now()

    artifact_dir = Path(config.output.artifacts_dir) / batch_id / record_id
    artifact_dir.mkdir(parents=True, exist_ok=True)
    events_path = artifact_dir / "events.jsonl"

    rotate_url = str(getattr(config.proxy_runtime, "rotate_url", "") or "").strip()
    runtime_proxy_list = [
        x
        for x in (getattr(config.proxy_runtime, "proxy_list", []) or [])
        if isinstance(x, dict) and bool(x.get("enabled", True))
    ]
    use_runtime_proxy_list = (not rotate_url) and bool(runtime_proxy_list)
    runtime_has_endpoint = bool(str(getattr(config.proxy_runtime, "host", "") or "").strip()) and int(getattr(config.proxy_runtime, "port", 0) or 0) > 0
    use_static_runtime_proxy = (not rotate_url) and (not use_runtime_proxy_list) and runtime_has_endpoint
    proxy_client = None if (rotate_url or use_runtime_proxy_list or use_static_runtime_proxy) else ProxyXoayClient(config.proxyxoay)
    tried_codes: Set[str] = set()
    banned_codes = _load_bad_proxy_codes(config)

    final_status = JobStatus.RETRYABLE_FAIL
    final_step = "init"
    final_error = ""
    final_confirm = ""
    final_proxy_code = ""
    final_proxy_ip = ""
    final_step6_ein = ""
    final_step6_legal_name = ""
    final_step6_data: Dict[str, Any] = {}
    final_pdf_path = ""
    final_pdf_bundle_path = ""
    final_error_type = ""
    attempts_made = 0
    record_name = str(record.get("NAME") or record.get("name") or record_id)

    total_attempts = config.retry.max_retries_per_record + 1
    max_attempt_seconds = max(60, int(getattr(config.retry, "max_attempt_seconds", 240) or 240))

    for attempt in range(1, total_attempts + 1):
        attempts_made = attempt
        selected_proxy: Dict[str, Any] | None = None
        try:
            emit_event("job_started",
                job_id=f"{batch_id}:{record_id}",
                record_id=record_id,
                batch_id=batch_id,
                source_file=source_file,
                attempt=attempt,
                mode="observe" if observe_mode else ("sandbox" if sandbox_mode else "full"),
            )
            # Sandbox mode: skip rotate and run without proxy to avoid external dependency.
            if sandbox_mode:
                proxy_code = "SANDBOX"
                final_proxy_code = proxy_code
                emit_event("step_update",
                    job_id=f"{batch_id}:{record_id}",
                    record_id=record_id,
                    step="proxy_rotate",
                    status="done",
                    note="Sandbox mode: Skipping rotation",
                    proxy_code=proxy_code,
                )
            elif rotate_url:
                proxy_code = "RUNTIME"
                final_proxy_code = proxy_code
                emit_event("step_update",
                    job_id=f"{batch_id}:{record_id}",
                    record_id=record_id,
                    step="proxy_rotate",
                    status="running",
                    note="Rotating runtime IP...",
                    proxy_code=proxy_code,
                )
                rotate_result = _rotate_runtime_ip_staggered(
                    rotate_url,
                    wait_seconds=config.proxy_runtime.change_ip_wait_seconds,
                )
                jsonl_append(
                    events_path,
                    {
                        "time": utc_now(),
                        "record_id": record_id,
                        "attempt": attempt,
                        "event": "proxy_rotate",
                        "proxy_code": proxy_code,
                        "rotate_status": rotate_result.status,
                        "rotate_message": rotate_result.message,
                        "new_ip": rotate_result.new_ip,
                    },
                )
                rotate_status = rotate_result.status.upper()
                if rotate_status == "COOLDOWN":
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step="proxy_rotate",
                        status="done",
                        note=f"cooldown -> keep current IP ({rotate_result.message})",
                        proxy_code=proxy_code,
                    )
                elif rotate_status not in {"SUCCESS", "SKIP"}:
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step="proxy_rotate",
                        status="failed",
                        note=f"rotate failed: {rotate_result.message}",
                        proxy_code=proxy_code,
                    )
                    final_status = JobStatus.RETRYABLE_FAIL
                    final_step = "proxy_rotate"
                    final_error = f"rotate failed: {rotate_result.message}"
                    if _should_ban_proxy(final_step, final_error):
                        _ban_proxy_code(config, final_proxy_code, final_error)
                    if attempt >= total_attempts:
                        break
                    backoff_seconds = _retry_backoff_seconds(config.retry.base_backoff_seconds, attempt)
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step="proxy_rotate",
                        status="retrying",
                        note=f"retry attempt {attempt + 1}/{total_attempts}: {final_error}",
                        proxy_code=proxy_code,
                    )
                    if backoff_seconds:
                        time.sleep(backoff_seconds)
                    continue
                else:
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step="proxy_rotate",
                        status="done",
                        note=f"IP rotated via runtime URL → {rotate_result.new_ip or 'ok'}",
                        proxy_code=proxy_code,
                        proxy_ip=rotate_result.new_ip,
                    )
                    final_proxy_ip = rotate_result.new_ip or ""
            elif use_runtime_proxy_list:
                selected_proxy, waited_for = _pick_runtime_list_proxy_staggered(config)
                proxy_host = str(selected_proxy.get("host", "")).strip()
                proxy_port = int(selected_proxy.get("port", 0) or 0)
                proxy_code = f"LIST:{proxy_host}:{proxy_port}"
                final_proxy_code = proxy_code
                final_proxy_ip = ""
                wait_note = f", waited {waited_for:.1f}s" if waited_for > 0 else ""
                is_rotating = "rotating" in str(selected_proxy.get("username", "")).lower()
                kind_str = "rotating proxy" if is_rotating else "proxy"
                emit_event("step_update",
                    job_id=f"{batch_id}:{record_id}",
                    record_id=record_id,
                    step="proxy_rotate",
                    status="done",
                    note=f"Using {kind_str} gateway {proxy_host}:{proxy_port}{wait_note}",
                    proxy_code=proxy_code,
                )
                jsonl_append(
                    events_path,
                    {
                        "time": utc_now(),
                        "record_id": record_id,
                        "attempt": attempt,
                        "event": "proxy_select",
                        "mode": "runtime_proxy_list",
                        "proxy_code": proxy_code,
                        "proxy_host": proxy_host,
                        "proxy_port": proxy_port,
                        "waited_seconds": waited_for,
                    },
                )
            elif use_static_runtime_proxy:
                proxy_code = "STATIC"
                final_proxy_code = proxy_code
                final_proxy_ip = ""
                emit_event("step_update",
                    job_id=f"{batch_id}:{record_id}",
                    record_id=record_id,
                    step="proxy_rotate",
                    status="done",
                    note="Static runtime proxy (no rotate link) -> skip rotate",
                    proxy_code=proxy_code,
                )
                jsonl_append(
                    events_path,
                    {
                        "time": utc_now(),
                        "record_id": record_id,
                        "attempt": attempt,
                        "event": "proxy_select",
                        "mode": "runtime_static",
                        "proxy_code": proxy_code,
                        "proxy_host": str(getattr(config.proxy_runtime, "host", "") or ""),
                        "proxy_port": int(getattr(config.proxy_runtime, "port", 0) or 0),
                    },
                )
            else:
                vm = pick_proxy_vm(proxy_client, exclude_codes=(tried_codes | banned_codes))
                proxy_code = vm.proxy_code
                tried_codes.add(proxy_code)
                final_proxy_code = proxy_code
                emit_event("step_update",
                    job_id=f"{batch_id}:{record_id}",
                    record_id=record_id,
                    step="proxy_rotate",
                    status="running",
                    note=f"Rotating via {proxy_code}...",
                    proxy_code=proxy_code,
                )

                rotate_result = rotate_proxy_ip(
                    proxy_client,
                    proxy_code,
                    wait_seconds=config.proxy_runtime.change_ip_wait_seconds,
                )
                jsonl_append(
                    events_path,
                    {
                        "time": utc_now(),
                        "record_id": record_id,
                        "attempt": attempt,
                        "event": "proxy_rotate",
                        "proxy_code": proxy_code,
                        "rotate_status": rotate_result.status,
                        "rotate_message": rotate_result.message,
                        "new_ip": rotate_result.new_ip,
                    },
                )

                rotate_status = rotate_result.status.upper()
                if rotate_status == "COOLDOWN":
                    logger.info("proxy_rotate cooldown for %s: %s", proxy_code, rotate_result.message)
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step="proxy_rotate",
                        status="done",
                        note=f"cooldown -> keep current IP ({rotate_result.message})",
                        proxy_code=proxy_code,
                    )
                elif rotate_status != "SUCCESS":
                    logger.warning("proxy_rotate failed for %s: %s", proxy_code, rotate_result.message)
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step="proxy_rotate",
                        status="failed",
                        note=f"rotate failed: {rotate_result.message}",
                        proxy_code=proxy_code,
                    )
                    final_status = JobStatus.RETRYABLE_FAIL
                    final_step = "proxy_rotate"
                    final_error = f"rotate failed: {rotate_result.message}"
                    if _should_ban_proxy(final_step, final_error):
                        _ban_proxy_code(config, final_proxy_code, final_error)
                    if attempt >= total_attempts:
                        break
                    backoff_seconds = _retry_backoff_seconds(config.retry.base_backoff_seconds, attempt)
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step="proxy_rotate",
                        status="retrying",
                        note=f"retry attempt {attempt + 1}/{total_attempts}: {final_error}",
                        proxy_code=proxy_code,
                    )
                    if backoff_seconds:
                        time.sleep(backoff_seconds)
                    continue
                else:
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step="proxy_rotate",
                        status="done",
                        note=f"IP rotated via {proxy_code} → {rotate_result.new_ip}",
                        proxy_code=proxy_code,
                        proxy_ip=rotate_result.new_ip,
                    )
                    final_proxy_ip = rotate_result.new_ip or ""

            endpoint = resolve_proxy_endpoint(
                config,
                proxy_code,
                runtime_proxy=(selected_proxy if (not sandbox_mode and use_runtime_proxy_list) else None),
            )
            emit_event("step_update",
                job_id=f"{batch_id}:{record_id}",
                record_id=record_id,
                step="init",
                status="running",
                note="Proxy ready, launching browser...",
                proxy_code=final_proxy_code or proxy_code,
                proxy_ip=final_proxy_ip,
                mode="observe" if observe_mode else ("sandbox" if sandbox_mode else "full"),
            )
            def _step_cb(step_name: str, step_st: str = "running", note: str = ""):
                emit_event("step_update",
                    job_id=f"{batch_id}:{record_id}",
                    record_id=record_id,
                    step=step_name,
                    status=step_st,
                    note=note,
                    proxy_code=final_proxy_code or proxy_code,
                    proxy_ip=final_proxy_ip,
                )

            status, last_step, error_message, confirmation, metadata = _run_single_attempt_with_timeout(
                config=config,
                record=record,
                proxy_endpoint=endpoint,
                artifact_dir=artifact_dir,
                use_proxy=(not sandbox_mode),
                timeout_seconds=max_attempt_seconds,
                step_callback=_step_cb,
            )

            final_status = status
            final_step = last_step
            final_error = error_message
            final_confirm = confirmation
            final_step6_ein = str(metadata.get("step6_ein", "") or "")
            final_step6_legal_name = str(metadata.get("step6_legal_name", "") or "")
            final_step6_data = dict(metadata)
            final_pdf_path = str(metadata.get("pdf_path", "") or "")

            # Emit step update for the last automation step reached
            emit_event("step_update",
                job_id=f"{batch_id}:{record_id}",
                record_id=record_id,
                step=last_step,
                status="done" if status == JobStatus.SUCCESS else "failed",
                note=confirmation if confirmation else error_message,
                proxy_code=final_proxy_code,
            )

            jsonl_append(
                events_path,
                {
                    "time": utc_now(),
                    "record_id": record_id,
                    "attempt": attempt,
                    "event": "attempt_result",
                    "status": status.value,
                    "last_step": last_step,
                    "error": error_message,
                },
            )

            if status in {JobStatus.SUCCESS, JobStatus.CANCELLED, JobStatus.MANUAL_REQUIRED, JobStatus.VALIDATION_FAILED}:
                break
            if status == JobStatus.RETRYABLE_FAIL:
                if _is_offline_apply_error(last_step, error_message):
                    final_status = JobStatus.CANCELLED
                    final_step = "irs_offline"
                    final_error = error_message or "IRS offline: submit Form SS-4 by fax or mail"
                    break
                if _is_daily_limit_error(last_step, error_message):
                    final_status = JobStatus.CANCELLED
                    final_step = "irs_daily_limit"
                    final_error = error_message or "IRS daily EIN limit reached: attempted too many requests for today"
                    break
                if _is_non_retryable_business_rule(last_step, error_message):
                    final_status = JobStatus.VALIDATION_FAILED
                    final_step = last_step or "irs_daily_limit"
                    final_error = error_message or "IRS business-rule limit hit"
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step=final_step,
                        status="failed",
                        note=final_error,
                        proxy_code=final_proxy_code,
                    )
                    break
                if _is_non_retryable_validation_failure(last_step, error_message):
                    final_status = JobStatus.VALIDATION_FAILED
                    final_step = last_step or "validation"
                    final_error = error_message or "Validation failed"
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step=final_step,
                        status="failed",
                        note=final_error,
                        proxy_code=final_proxy_code,
                    )
                    break
                retry_note = error_message or last_step or "retryable failure"
                if _is_system_environment_error(last_step, retry_note):
                    final_step = last_step or "runtime"
                    final_error = retry_note
                    break
                if not _is_known_retryable_failure(last_step, retry_note):
                    final_status = JobStatus.MANUAL_REQUIRED
                    final_step = last_step or "manual_review"
                    final_error = retry_note
                    emit_event("step_update",
                        job_id=f"{batch_id}:{record_id}",
                        record_id=record_id,
                        step=final_step,
                        status="failed",
                        note=f"unknown failure -> moved to manual queue (no auto retry): {final_error}",
                        proxy_code=final_proxy_code,
                    )
                    break
                if final_proxy_code and _should_ban_proxy(last_step, error_message):
                    _ban_proxy_code(config, final_proxy_code, error_message or last_step)
                if attempt >= total_attempts:
                    break
                backoff_seconds = _retry_backoff_seconds(config.retry.base_backoff_seconds, attempt)
                if not _is_transient_retryable(last_step, retry_note):
                    retry_note = f"automation failure, retrying: {retry_note}"
                emit_event("step_update",
                    job_id=f"{batch_id}:{record_id}",
                    record_id=record_id,
                    step=last_step,
                    status="retrying",
                    note=f"retry attempt {attempt + 1}/{total_attempts}: {retry_note}",
                    proxy_code=final_proxy_code,
                )
                jsonl_append(
                    events_path,
                    {
                        "time": utc_now(),
                        "record_id": record_id,
                        "attempt": attempt,
                        "event": "retry_scheduled",
                        "next_attempt": attempt + 1,
                        "reason": retry_note,
                        "backoff_seconds": backoff_seconds,
                    },
                )
                if backoff_seconds:
                    time.sleep(backoff_seconds)
                continue
        except Exception as exc:
            logger.exception("Attempt %s failed for record %s", attempt, record_id)
            final_status = JobStatus.RETRYABLE_FAIL
            final_step = "exception"
            final_error = str(exc)
            jsonl_append(
                events_path,
                {
                    "time": utc_now(),
                    "record_id": record_id,
                    "attempt": attempt,
                    "event": "attempt_exception",
                    "error": str(exc),
                },
            )
            if final_proxy_code and _should_ban_proxy(final_step, final_error):
                _ban_proxy_code(config, final_proxy_code, str(exc))
            if _is_non_retryable_validation_failure(final_step, final_error):
                final_status = JobStatus.VALIDATION_FAILED
                emit_event("step_update",
                    job_id=f"{batch_id}:{record_id}",
                    record_id=record_id,
                    step=final_step,
                    status="failed",
                    note=final_error,
                    proxy_code=final_proxy_code,
                )
            if _is_system_environment_error(final_step, final_error):
                break
            if not _is_known_retryable_failure(final_step, final_error):
                final_status = JobStatus.MANUAL_REQUIRED
                emit_event("step_update",
                    job_id=f"{batch_id}:{record_id}",
                    record_id=record_id,
                    step=final_step,
                    status="failed",
                    note=f"unknown failure -> moved to manual queue (no auto retry): {final_error}",
                    proxy_code=final_proxy_code,
                )
                break
            if attempt >= total_attempts:
                break
            backoff_seconds = _retry_backoff_seconds(config.retry.base_backoff_seconds, attempt)
            emit_event("step_update",
                job_id=f"{batch_id}:{record_id}",
                record_id=record_id,
                step=final_step,
                status="retrying",
                note=f"retry attempt {attempt + 1}/{total_attempts}: {final_error}",
                proxy_code=final_proxy_code,
            )
            if backoff_seconds:
                time.sleep(backoff_seconds)
            continue

    if final_status == JobStatus.RETRYABLE_FAIL:
        # retries exhausted
        final_status = JobStatus.MANUAL_REQUIRED

    final_error_type = _classify_error_type(final_step, final_error, final_status)

    old_artifact_dir = artifact_dir
    artifact_dir = _relocate_artifacts_by_status(config, batch_id, record_id, final_status, artifact_dir)
    if artifact_dir != old_artifact_dir:
        final_pdf_path = _remap_path(old_artifact_dir, artifact_dir, final_pdf_path)
        if final_step6_data.get("pdf_path"):
            final_step6_data["pdf_path"] = _remap_path(old_artifact_dir, artifact_dir, str(final_step6_data.get("pdf_path")))
    events_path = artifact_dir / "events.jsonl"

    is_sys_err = _is_system_environment_error(final_step, final_error)
    is_offline = _is_offline_apply_error(final_step, final_error)
    is_daily_lim = _is_daily_limit_error(final_step, final_error)

    if final_status == JobStatus.SUCCESS:
        with _CONSECUTIVE_DAILY_LIMIT_LOCK:
            _CONSECUTIVE_DAILY_LIMIT_HITS = 0

    if is_sys_err:
        logger.error("System / app environment error detected: %s. Auto requeueing job %s and stopping worker.", final_error, queue_job_id)
        try:
            update_job_status_and_queue(config, queue_job_id, "pending", config.queue.queue_default)
        except Exception as exc:
            logger.warning("Failed to requeue system error job: %s", exc)
        emit_event("step_update",
            job_id=queue_job_id,
            record_id=record_id,
            step=final_step,
            status="requeued",
            note=f"Lỗi môi trường/hệ thống ({final_error}). Đã tự động requeue và dừng worker.",
            proxy_code=final_proxy_code,
        )
        emit_event("system_stop_requested",
            reason="system_environment_error",
            message=f"Lỗi môi trường/hệ thống: {final_error}. Đã tự động hoàn trả hồ sơ về hàng đợi (Pending) và dừng worker để bảo toàn dữ liệu."
        )
        GLOBAL_WORKER_STOP_EVENT.set()
        return {
            "batch_id": batch_id,
            "record_id": record_id,
            "status": "requeued",
            "error": final_error,
            "system_error": True,
        }

    if is_offline:
        is_open, time_reason = is_irs_operational_hours()
        logger.warning("IRS offline / outside hours detected: %s (%s). Auto requeueing job %s and stopping worker.", final_error, time_reason, queue_job_id)
        db_status = "pending"
        try:
            update_job_status_and_queue(config, queue_job_id, "pending", config.queue.queue_default)
        except Exception as exc:
            logger.warning("Failed to requeue offline job: %s", exc)
        emit_event("system_stop_requested",
            reason="irs_offline",
            message=f"IRS ngoài giờ phục vụ ({time_reason}). Đã tự động requeue hồ sơ và tạm dừng toàn bộ worker."
        )
        GLOBAL_WORKER_STOP_EVENT.set()
    elif is_daily_lim:
        logger.warning("IRS daily limit hit: %s for job %s (record %s). Moving to manual_required.", final_error, queue_job_id, record_id)
        db_status = "manual_required"
        try:
            update_job_status_and_queue(config, queue_job_id, "manual_required", config.queue.queue_manual)
        except Exception as exc:
            logger.warning("Failed to move daily limit job to manual queue: %s", exc)
        emit_event("step_update",
            job_id=queue_job_id,
            record_id=record_id,
            step="irs_daily_limit",
            status="manual_required",
            note="Chạm giới hạn IRS Daily Limit (1 EIN/ngày cho mỗi SSN). Đã chuyển sang Chờ xử lý.",
            proxy_code=final_proxy_code,
        )
    else:
        db_status = {
            JobStatus.SUCCESS: "done",
            JobStatus.MANUAL_REQUIRED: "manual_required",
            JobStatus.CANCELLED: "cancelled",
        }.get(final_status, "failed")
        try:
            if final_status == JobStatus.MANUAL_REQUIRED and queue_name != config.queue.queue_manual:
                update_job_status_and_queue(config, queue_job_id, db_status, config.queue.queue_manual)
            else:
                update_job_status(config, queue_job_id, db_status)
        except Exception as exc:
            logger.warning("Failed to update job status in queue db for %s: %s", record_id, exc)

    # Emit final job completion event
    final_pdf_bundle_path = _prepare_final_bundle(
        artifact_dir,
        batch_id=batch_id,
        record_id=record_id,
        record_name=record_name,
        status=final_status,
        confirmation_number=final_confirm,
        step6_ein=final_step6_ein,
        step6_legal_name=final_step6_legal_name,
        step6_data=final_step6_data,
        pdf_path=final_pdf_path,
        proxy_code=final_proxy_code,
        proxy_ip=final_proxy_ip,
    )

    # Emit final job completion event
    emit_event("job_complete",
        job_id=f"{batch_id}:{record_id}",
        record_id=record_id,
        record_name=record_name,
        batch_id=batch_id,
        source_file=source_file,
        mode="observe" if observe_mode else ("sandbox" if sandbox_mode else "full"),
        status=final_status.value,
        confirmation_number=final_confirm,
        step6_ein=final_step6_ein,
        step6_legal_name=final_step6_legal_name,
        step6_data=final_step6_data,
        pdf_path=final_pdf_path,
        final_pdf_path=final_pdf_bundle_path,
        error_type=final_error_type,
        error_code=final_step if final_status != JobStatus.SUCCESS else "",
        error_message=final_error,
        last_step=final_step,
        proxy_used=final_proxy_code,
        proxy_ip=final_proxy_ip,
        attempt_count=attempts_made,
        started_at=started_at,
        ended_at=utc_now(),
        artifact_dir=str(artifact_dir),
    )

    compact_step6 = _compact_step6_data(final_step6_data)

    result = JobResult(
        batch_id=batch_id,
        record_id=record_id,
        record_name=record_name,
        status=final_status,
        attempt_count=attempts_made,
        proxy_used=final_proxy_code,
        proxy_ip=final_proxy_ip,
        started_at=started_at,
        ended_at=utc_now(),
        last_step=final_step,
        artifact_dir=str(artifact_dir),
        error_type=final_error_type,
        error_code=final_step if final_status != JobStatus.SUCCESS else "",
        error_message=final_error,
        confirmation_number=final_confirm,
        step6_ein=final_step6_ein,
        step6_legal_name=final_step6_legal_name,
        step6_name_control=str(compact_step6.get("step6_name_control", "") or ""),
        step6_phone_number=str(compact_step6.get("step6_phone_number", "") or ""),
        step6_county=str(compact_step6.get("step6_county", "") or ""),
        step6_state=str(compact_step6.get("step6_state", "") or ""),
        step6_start_date=str(compact_step6.get("step6_start_date", "") or ""),
        step6_principal_activity=str(compact_step6.get("step6_principal_activity", "") or ""),
        step6_principal_product_service=str(compact_step6.get("step6_principal_product_service", "") or ""),
        step6_reason_for_applying=str(compact_step6.get("step6_reason_for_applying", "") or ""),
        step6_physical_location=str(compact_step6.get("step6_physical_location", "") or ""),
        step6_responsible_name=str(compact_step6.get("step6_responsible_name", "") or ""),
        step6_responsible_ssn_itin=str(compact_step6.get("step6_responsible_ssn_itin", "") or ""),
        step6_data_json=json.dumps(compact_step6, ensure_ascii=True),
        pdf_path=final_pdf_path,
        final_pdf_path=final_pdf_bundle_path,
    )

    append_result_row(Path(config.output.output_csv), result.to_row())
    try:
        update_batch_manifest(Path(config.output.output_csv), result.to_row())
    except Exception:
        # do not block job completion on manifest write issue
        pass

    write_json(artifact_dir / "result.json", result.to_row())
    if not bool(getattr(config.output, "keep_debug_artifacts", False)):
        _prune_debug_artifacts(artifact_dir)

    return result.to_row()


def noop_manual_job(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Placeholder manual queue job payload holder."""
    return payload
