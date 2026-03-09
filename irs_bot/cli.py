from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

from .config import ConfigError, load_config
from .excel_ingest import load_csv_rows, load_excel_rows, validate_rows
from .ingest_pipeline import import_file_to_queue
from .logging_utils import setup_logging
from .manual_session import ManualSessionError, run_manual_session
from .proxyxoay_client import ProxyXoayClient, ProxyXoayError, ProxyXoayHttpError
from .queueing import enqueue_records
from .queueing import list_jobs, delete_jobs, requeue_jobs, recover_stale_running_jobs, normalize_manual_pending_jobs
from .scheduler import renew_expiring_once, run_scheduler_loop, run_scheduler_once
from .watcher import watch_inbox
from .worker_jobs import process_record_job

logger = logging.getLogger(__name__)


def _slug_token(s: str, max_len: int = 32) -> str:
    txt = re.sub(r"[^a-z0-9_-]+", "_", str(s or "").strip().lower())
    txt = re.sub(r"_+", "_", txt).strip("_")
    if not txt:
        txt = "na"
    return txt[:max_len]


def _batch_short(batch_id: str) -> str:
    m = re.search(r"(\d{6,})", str(batch_id))
    if m:
        token = m.group(1)[-6:]
        return f"b{token}"
    return _slug_token(batch_id, 10)


def _detect_mode(batch_rows: List[Dict[str, Any]]) -> str:
    for row in batch_rows:
        q = str(row.get("queue_name", "")).lower()
        if "sandbox" in q:
            return "sandbox"
        if "manual" in q:
            return "manual"
    return "full"


def _report_stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _report_file_base(kind: str, mode: str, batch_id: str) -> str:
    return f"{_slug_token(kind, 12)}_{_slug_token(mode, 12)}_{_batch_short(batch_id)}_{_report_stamp()}"


def _queue_window_open(cfg) -> bool:
    tz_name = str(getattr(cfg.queue, "queue_timezone", "Asia/Ho_Chi_Minh") or "Asia/Ho_Chi_Minh")
    start_hour = int(getattr(cfg.queue, "queue_start_hour", 18) or 18)
    try:
        now_hour = datetime.now(ZoneInfo(tz_name)).hour
    except Exception:
        now_hour = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).hour
    return now_hour >= max(0, min(23, start_hour))


def _read_results_by_key(cfg) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    results_csv = Path(cfg.output.output_csv)
    if not results_csv.exists():
        return out
    try:
        with results_csv.open("r", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                key = f"{row.get('batch_id','')}::{row.get('record_id','')}"
                out[key] = row
    except Exception:
        return out
    return out


def _export_annotated_batch(
    cfg,
    batch_id: str,
    fmt: str = "xlsx",
    out_dir: str | None = None,
    report_type: str = "report",
) -> Dict[str, Any]:
    rows = list_jobs(cfg)
    batch_rows = [r for r in rows if str((r.get("payload") or {}).get("batch_id", "")) == batch_id]
    if not batch_rows:
        raise RuntimeError(f"No queue rows found for batch_id={batch_id}")

    result_map = _read_results_by_key(cfg)
    preferred_input = ["NAME", "SSN", "DOB", "GENDER", "ADDRESS", "CITI", "BANG", "ZIP", "Phone", "country", "record_id"]
    input_cols: List[str] = []
    prepared: List[Dict[str, Any]] = []
    for row in batch_rows:
        payload = row.get("payload") or {}
        record = payload.get("record") or {}
        for k in record.keys():
            if k not in input_cols:
                input_cols.append(k)
        rec_id = str(record.get("record_id", "")).strip() or str(row.get("job_id", "")).split(":", 1)[-1]
        key = f"{batch_id}::{rec_id}"
        r = result_map.get(key, {})
        queue_status = str(row.get("status", "pending"))
        run_status = str(r.get("status", queue_status))
        started_at = r.get("started_at", "")
        ended_at = r.get("ended_at", "")
        duration_s = ""
        try:
            if started_at and ended_at:
                duration_s = max(
                    0,
                    int((datetime.fromisoformat(str(ended_at)) - datetime.fromisoformat(str(started_at))).total_seconds()),
                )
        except Exception:
            duration_s = ""
        merged = {k: record.get(k, "") for k in input_cols}
        ein_assigned = str(r.get("step6_ein", "") or r.get("confirmation_number", "") or "")
        final_pdf_path = str(r.get("final_pdf_path", "") or "")
        artifact_dir = str(r.get("artifact_dir", "") or "")
        merged.update(
            {
                "record_id": rec_id,
                "run_status": run_status,
                "queue_status": queue_status,
                "ein_assigned": ein_assigned,
                "legal_name": r.get("step6_legal_name", ""),
                "name_control": r.get("step6_name_control", ""),
                "phone_number": r.get("step6_phone_number", ""),
                "county": r.get("step6_county", ""),
                "state": r.get("step6_state", ""),
                "start_date": r.get("step6_start_date", ""),
                "principal_activity": r.get("step6_principal_activity", ""),
                "product_service": r.get("step6_principal_product_service", ""),
                "reason_for_applying": r.get("step6_reason_for_applying", ""),
                "proxy_used": r.get("proxy_used", ""),
                "proxy_ip": r.get("proxy_ip", ""),
                "final_pdf_path": r.get("final_pdf_path", ""),
                "final_pdf_file": Path(final_pdf_path).name if final_pdf_path else "",
                "artifact_dir": artifact_dir,
                "artifact_folder": Path(artifact_dir).name if artifact_dir else "",
                "attempt_count": r.get("attempt_count", ""),
                "duration_s": duration_s,
                "started_at": started_at,
                "completed_at": ended_at,
                "last_step": r.get("last_step", ""),
                "error_type": r.get("error_type", ""),
                "error_code": r.get("error_code", ""),
                "error_message": r.get("error_message", ""),
                "source_file": Path(str((payload.get("source_file") or r.get("source_file") or ""))).name,
                "batch_id": batch_id,
            }
        )
        prepared.append(merged)

    report_type = str(report_type or "report").strip().lower()
    if report_type in {"failures", "failed"}:
        prepared = [r for r in prepared if str(r.get("run_status", "")).lower() not in {"success", "done"}]

    # Keep input first in a stable order, then append unknown columns.
    ordered_input_cols = [c for c in preferred_input if c in input_cols] + [c for c in input_cols if c not in preferred_input]

    def _has_any_value(col: str) -> bool:
        for item in prepared:
            if str(item.get(col, "")).strip():
                return True
        return False

    cleaned_input_cols: List[str] = []
    for c in ordered_input_cols:
        col = str(c or "").strip()
        if not col:
            continue
        normalized = re.sub(r"[\s\-]+", "_", col).lower()
        is_empty_marker = bool(re.match(r"^_?empty(_\d+)?$", normalized))
        has_value = _has_any_value(c)
        # Drop parser-noise empty headers.
        if is_empty_marker and not has_value:
            continue
        # Drop fully blank unknown columns to keep report clean.
        if not has_value and c not in preferred_input:
            continue
        cleaned_input_cols.append(c)

    # Keep output columns concise.
    result_cols = [
        "run_status",
        "queue_status",
        "ein_assigned",
        "legal_name",
        "county",
        "state",
        "product_service",
        "proxy_used",
        "proxy_ip",
        "duration_s",
        "completed_at",
        "last_step",
        "error_type",
        "error_code",
        "error_message",
        "final_pdf_file",
    ]
    headers = cleaned_input_cols + [c for c in result_cols if c not in cleaned_input_cols]

    mode = _detect_mode(batch_rows)
    default_root = Path(cfg.output.output_csv).parent
    if report_type in {"failures", "failed"}:
        default_root = default_root / "failures"
    else:
        default_root = default_root / "reports"
    base_dir = Path(out_dir) if out_dir else default_root
    base_dir.mkdir(parents=True, exist_ok=True)

    file_base = _report_file_base("failures" if report_type in {"failures", "failed"} else "report", mode, batch_id)
    csv_path = base_dir / f"{file_base}.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for item in prepared:
            writer.writerow({k: item.get(k, "") for k in headers})

    xlsx_path: Path | None = base_dir / f"{file_base}.xlsx"
    label_map = {
        "NAME": "Name",
        "SSN": "SSN",
        "DOB": "DOB",
        "GENDER": "Gender",
        "ADDRESS": "Address",
        "CITI": "City",
        "BANG": "State",
        "ZIP": "ZIP",
        "Phone": "Phone",
        "country": "Country",
        "record_id": "Record ID",
        "run_status": "Run Status",
        "queue_status": "Queue Status",
        "ein_assigned": "EIN Assigned",
        "legal_name": "Legal Name",
        "county": "County",
        "state": "State/Territory",
        "product_service": "Product/Service",
        "proxy_used": "Proxy",
        "proxy_ip": "Proxy IP",
        "duration_s": "Duration (s)",
        "completed_at": "Completed At",
        "last_step": "Last Step",
        "error_type": "Error Type",
        "error_code": "Error Code",
        "error_message": "Error Message",
        "final_pdf_file": "Final PDF",
    }
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        wb = Workbook()
        ws = wb.active
        ws.title = "report"
        display_headers = [label_map.get(h, h) for h in headers]
        ws.append(display_headers)
        header_fill = PatternFill(fill_type="solid", fgColor="1F2937")
        header_font = Font(color="FFFFFF", bold=True)
        thin = Side(style="thin", color="E5E7EB")
        border = Border(left=thin, right=thin, top=thin, bottom=thin)
        for c in range(1, len(display_headers) + 1):
            cell = ws.cell(row=1, column=c)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = border
        ws.row_dimensions[1].height = 24

        green_fill = PatternFill(fill_type="solid", fgColor="DCFCE7")
        red_fill = PatternFill(fill_type="solid", fgColor="FEE2E2")
        yellow_fill = PatternFill(fill_type="solid", fgColor="FEF9C3")

        for idx, item in enumerate(prepared, start=2):
            ws.append([item.get(k, "") for k in headers])
            st = str(item.get("run_status", "")).strip().lower()
            row_fill = green_fill if st in {"success", "done"} else yellow_fill if st in {"manual_required", "cancelled", "pending", "running"} else red_fill
            for c in range(1, len(display_headers) + 1):
                cell = ws.cell(row=idx, column=c)
                cell.fill = row_fill
                cell.border = border
                cell.alignment = Alignment(vertical="center")

        # Improve readability with smart column widths.
        for col_idx, col_name in enumerate(display_headers, start=1):
            max_len = len(str(col_name))
            for row_idx in range(2, min(ws.max_row, 800) + 1):
                val = ws.cell(row=row_idx, column=col_idx).value
                if val is None:
                    continue
                max_len = max(max_len, len(str(val)))
            if col_name in {"Error Message"}:
                width = min(64, max(24, max_len + 2))
            elif col_name in {"Name", "Address", "City", "Record ID"}:
                width = min(32, max(14, max_len + 2))
            else:
                width = min(22, max(10, max_len + 2))
            ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = width

        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        wb.save(str(xlsx_path))
    except Exception:
        xlsx_path = None

    preferred = str(xlsx_path) if (fmt == "xlsx" and xlsx_path and xlsx_path.exists()) else str(csv_path)
    return {
        "batch_id": batch_id,
        "mode": mode,
        "report_type": report_type,
        "rows": len(prepared),
        "csv_path": str(csv_path),
        "xlsx_path": str(xlsx_path) if xlsx_path and xlsx_path.exists() else "",
        "preferred_path": preferred,
    }


def _export_debug_pack(cfg, batch_id: str, out_dir: str | None = None) -> Dict[str, Any]:
    rows = list_jobs(cfg)
    batch_rows = [r for r in rows if str((r.get("payload") or {}).get("batch_id", "")) == batch_id]
    if not batch_rows:
        raise RuntimeError(f"No queue rows found for batch_id={batch_id}")

    mode = _detect_mode(batch_rows)
    base_root = Path(out_dir) if out_dir else (Path(cfg.output.output_csv).parent / "debug")
    base_root.mkdir(parents=True, exist_ok=True)

    report = _export_annotated_batch(cfg, batch_id, fmt="xlsx", out_dir=str(base_root), report_type="report")
    failures = _export_annotated_batch(cfg, batch_id, fmt="xlsx", out_dir=str(base_root), report_type="failures")

    artifacts_root = Path(cfg.output.artifacts_dir) / batch_id
    file_base = _report_file_base("debug_pack", mode, batch_id)
    zip_path = base_root / f"{file_base}.zip"

    manifest = {
        "batch_id": batch_id,
        "mode": mode,
        "generated_at": datetime.now().isoformat(),
        "queue_rows": len(batch_rows),
        "report_path": report.get("preferred_path", ""),
        "failures_path": failures.get("preferred_path", ""),
    }

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in [report.get("csv_path"), report.get("xlsx_path"), failures.get("csv_path"), failures.get("xlsx_path")]:
            pstr = str(p or "").strip()
            if not pstr:
                continue
            pp = Path(pstr)
            if pp.exists() and pp.is_file() and pp.name:
                zf.write(pp, arcname=f"reports/{pp.name}")
        if artifacts_root.exists():
            # include only final files + result/events for concise debug pack
            for sub in artifacts_root.rglob("*"):
                if not sub.is_file():
                    continue
                name = sub.name.lower()
                if name.endswith(".pdf") or name in {"result.json", "events.jsonl", "step6.json"}:
                    arc = Path("artifacts") / sub.relative_to(artifacts_root)
                    zf.write(sub, arcname=str(arc))
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    return {
        "batch_id": batch_id,
        "mode": mode,
        "zip_path": str(zip_path),
        "report_path": str(report.get("preferred_path", "")),
        "failures_path": str(failures.get("preferred_path", "")),
    }



def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="IRS EIN automation bot")
    p.add_argument("--config", default="irs_bot/config.yml", help="Path to config yml")

    sp = p.add_subparsers(dest="command", required=True)

    run_cmd = sp.add_parser("run", help="Run one input file immediately without queue")
    run_cmd.add_argument("--input", required=True, help="Input .xlsx/.csv file")
    run_cmd.add_argument("--sheet", default="records", help="Excel sheet name")

    imp = sp.add_parser("import-excel", help="Import input file and enqueue jobs")
    imp.add_argument("input", help="Input .xlsx/.csv file")
    imp.add_argument("--sheet", default="records", help="Excel sheet name")
    imp.add_argument("--archive", default="archive", help="Archive directory")
    imp.add_argument("--error", default="error", help="Error directory")
    imp.add_argument("--queue", default="", help="Queue name override")

    watch = sp.add_parser("watch", help="Watch inbox and auto enqueue")
    watch.add_argument("--inbox", default="inbox", help="Inbox directory")
    watch.add_argument("--archive", default="archive", help="Archive directory")
    watch.add_argument("--error", default="error", help="Error directory")
    watch.add_argument("--sheet", default="records", help="Excel sheet name")

    worker = sp.add_parser("worker", help="Start RQ worker")
    worker.add_argument(
        "--queues",
        default="",
        help="Comma-separated queue names. Default from config.",
    )
    worker.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of concurrent worker threads in this process.",
    )

    sch = sp.add_parser("scheduler", help="Run scheduler")
    sch.add_argument("--loop", action="store_true", help="Run continuously")
    sch.add_argument("--interval", type=int, default=60, help="Loop interval seconds")
    sch.add_argument("--renew-codes", default="", help="Comma-separated VM codes to renew now")

    proxy = sp.add_parser("proxy", help="ProxyXoay actions")
    proxy_sp = proxy.add_subparsers(dest="proxy_cmd", required=True)

    proxy_sp.add_parser("sync", help="List inside proxies")
    proxy_sp.add_parser("count", help="Count inside proxies")

    rotate = proxy_sp.add_parser("rotate", help="Rotate proxy IP")
    rotate.add_argument("--code", required=True, help="Proxy code")
    proxy_sp.add_parser("rotate-auto", help="Pick first available proxy and rotate IP")

    renew = proxy_sp.add_parser("renew", help="Renew VM codes")
    renew.add_argument("--codes", required=True, help="Comma-separated VM codes")

    manual = sp.add_parser("manual", help="Start manual browser session with rotate IP + HTML snapshots")
    manual.add_argument("--url", default="", help="Start URL. Default is config.target_url")
    manual.add_argument("--snapshot-dir", default="artifacts/manual", help="Snapshot output directory")
    manual.add_argument("--skip-rotate", action="store_true", help="Skip ProxyXoay rotate API and open directly")

    queue = sp.add_parser("queue", help="Queue DB actions")
    queue_sp = queue.add_subparsers(dest="queue_cmd", required=True)
    queue_sp.add_parser("list", help="List queue jobs")

    q_remove = queue_sp.add_parser("remove", help="Remove jobs by ids")
    q_remove.add_argument("--ids", required=True, help="Comma-separated job ids")

    q_requeue = queue_sp.add_parser("requeue", help="Set jobs back to pending")
    q_requeue.add_argument("--ids", required=True, help="Comma-separated job ids")

    q_recover = queue_sp.add_parser("recover-running", help="Recover stale running jobs to pending")
    q_recover.add_argument("--stale-seconds", type=int, default=900)
    q_export = queue_sp.add_parser("export-annotated", help="Export batch report with input+result status")
    q_export.add_argument("--batch-id", required=True, help="Batch id to export")
    q_export.add_argument("--format", default="xlsx", choices=["xlsx", "csv"], help="Preferred output format")
    q_export.add_argument("--out-dir", default="", help="Output directory override")
    q_export.add_argument("--type", default="report", choices=["report", "failures"], help="Report type")

    q_debug = queue_sp.add_parser("export-debug-pack", help="Export debug ZIP for one batch")
    q_debug.add_argument("--batch-id", required=True, help="Batch id to export")
    q_debug.add_argument("--out-dir", default="", help="Output directory override")

    return p



def _set_env_config(config_path: str) -> None:
    import os

    os.environ["IRS_BOT_CONFIG"] = str(config_path)



def cmd_run(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    input_path = Path(args.input)

    if input_path.suffix.lower() == ".csv":
        rows = load_csv_rows(input_path)
    else:
        rows = load_excel_rows(input_path, sheet_name=args.sheet)

    errors = validate_rows(rows, cfg)
    if errors:
        for e in errors:
            print(e)
        return 2

    _set_env_config(args.config)
    batch_id = "manual-run"
    for row in rows:
        payload = {"batch_id": batch_id, "source_file": str(input_path), "record": row}
        result = process_record_job(payload)
        print(json.dumps(result, ensure_ascii=True))
    return 0



def cmd_import(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    batch_id, job_ids = import_file_to_queue(
        cfg,
        input_file=args.input,
        archive_dir=args.archive,
        error_dir=args.error,
        sheet_name=args.sheet,
        queue_name=(args.queue.strip() or None),
    )
    if not job_ids:
        detail = "No jobs enqueued (validation failed, duplicate rows, or empty input)"
        try:
            err_path = Path(cfg.output.state_dir) / "errors" / f"{batch_id}.json"
            if err_path.exists():
                payload = json.loads(err_path.read_text(encoding="utf-8"))
                errs = payload.get("errors") if isinstance(payload, dict) else None
                if isinstance(errs, list) and errs:
                    detail = "; ".join(str(x) for x in errs[:5])
        except Exception:
            pass
        print(json.dumps({
            "batch_id": batch_id,
            "job_ids": [],
            "enqueued": 0,
            "error": detail
        }, ensure_ascii=True))
        return 2
    print(json.dumps({"batch_id": batch_id, "job_ids": job_ids, "enqueued": len(job_ids)}, ensure_ascii=True))
    return 0



def cmd_watch(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    _set_env_config(args.config)
    watch_inbox(
        cfg,
        inbox_dir=args.inbox,
        archive_dir=args.archive,
        error_dir=args.error,
        sheet_name=args.sheet,
    )
    return 0



def cmd_worker(args: argparse.Namespace) -> int:
    import time
    import threading
    from .worker_jobs import process_record_job
    from .queueing import get_next_job

    cfg = load_config(args.config)
    _set_env_config(args.config)
    if args.queues:
        queues = [q.strip() for q in args.queues.split(",") if q.strip()]
    else:
        queues = [
            cfg.queue.queue_high,
            cfg.queue.queue_default,
            cfg.queue.queue_retry,
            "ein.sandbox",
        ]
    # keep order, remove duplicates
    queues = list(dict.fromkeys(queues))
    worker_count = max(1, int(getattr(args, "workers", 1) or 1))
    stagger_seconds = 0.0
    if worker_count > 1:
        try:
            stagger_seconds = max(0.0, float(str(os.environ.get("BUG_AUTO_WORKER_STAGGER_SECONDS", "5") or "5")))
        except Exception:
            stagger_seconds = 5.0
    # On fresh worker start, reclaim any interrupted "running" rows immediately.
    recovered = recover_stale_running_jobs(cfg, stale_seconds=0)
    if recovered:
        logger.info("Recovered %s stale running jobs back to pending", recovered)
    normalized_manual = normalize_manual_pending_jobs(cfg)
    if normalized_manual:
        logger.info("Normalized %s legacy pending jobs in manual queue to manual_required", normalized_manual)

    logger.info(
        "Starting local SQLite worker loop with %s worker(s), stagger=%ss listening on %s...",
        worker_count,
        f"{stagger_seconds:g}",
        queues,
    )
    stop_event = threading.Event()

    def _worker_loop(worker_idx: int) -> None:
        if stagger_seconds > 0 and worker_idx > 1:
            startup_delay = float(worker_idx - 1) * stagger_seconds
            logger.info("[W%s] startup stagger sleeping %.1fs", worker_idx, startup_delay)
            deadline = time.time() + startup_delay
            while not stop_event.is_set():
                remain = deadline - time.time()
                if remain <= 0:
                    break
                time.sleep(min(0.25, remain))
            if stop_event.is_set():
                return
        while not stop_event.is_set():
            try:
                job = get_next_job(cfg, queues)
                if job:
                    logger.info("[W%s] Picked up job %s", worker_idx, job["job_id"])
                    try:
                        process_record_job(job)
                    except Exception:
                        logger.exception("[W%s] Failed processing job %s", worker_idx, job.get("job_id"))
                else:
                    time.sleep(0.25)
            except Exception:
                logger.exception("[W%s] Worker loop error (poll/dispatch)", worker_idx)
                time.sleep(0.5)

    threads = [
        threading.Thread(
            target=_worker_loop,
            args=(idx,),
            name=f"irs-worker-{idx}",
            daemon=True,
        )
        for idx in range(1, worker_count + 1)
    ]
    for t in threads:
        t.start()

    try:
        while any(t.is_alive() for t in threads):
            time.sleep(0.5)
    except KeyboardInterrupt:
        logger.info("Worker stop requested by user.")
    finally:
        stop_event.set()
        for t in threads:
            t.join(timeout=2.0)
        logger.info("Worker stopped.")

    return 0


def cmd_queue(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    if args.queue_cmd == "list":
        rows = list_jobs(cfg)
        print(json.dumps({"rows": rows, "count": len(rows)}, ensure_ascii=True))
        return 0
    if args.queue_cmd == "remove":
        ids = [x.strip() for x in args.ids.split(",") if x.strip()]
        count = delete_jobs(cfg, ids)
        print(json.dumps({"deleted": count}, ensure_ascii=True))
        return 0
    if args.queue_cmd == "requeue":
        ids = [x.strip() for x in args.ids.split(",") if x.strip()]
        count = requeue_jobs(cfg, ids)
        print(json.dumps({"requeued": count}, ensure_ascii=True))
        return 0
    if args.queue_cmd == "recover-running":
        count = recover_stale_running_jobs(cfg, stale_seconds=args.stale_seconds)
        print(json.dumps({"recovered": count}, ensure_ascii=True))
        return 0
    if args.queue_cmd == "export-annotated":
        out = _export_annotated_batch(
            cfg,
            batch_id=str(args.batch_id),
            fmt=str(args.format or "xlsx"),
            out_dir=(str(args.out_dir).strip() or None),
            report_type=str(getattr(args, "type", "report") or "report"),
        )
        print(json.dumps(out, ensure_ascii=True))
        return 0
    if args.queue_cmd == "export-debug-pack":
        out = _export_debug_pack(
            cfg,
            batch_id=str(args.batch_id),
            out_dir=(str(args.out_dir).strip() or None),
        )
        print(json.dumps(out, ensure_ascii=True))
        return 0
    return 2



def cmd_scheduler(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    if args.renew_codes:
        vm_codes = [x.strip() for x in args.renew_codes.split(",") if x.strip()]
        result = renew_expiring_once(cfg, vm_codes)
        print(json.dumps(result, ensure_ascii=True))

    if args.loop:
        run_scheduler_loop(cfg, interval_seconds=args.interval)
    else:
        run_scheduler_once(cfg)
    return 0



def cmd_proxy(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    client = ProxyXoayClient(cfg.proxyxoay)

    if args.proxy_cmd == "sync":
        data = [
            {
                "id": vm.id,
                "name": vm.name,
                "status": vm.status,
                "ip": vm.ip,
                "proxy_code": vm.proxy_code,
            }
            for vm in client.list_inside_proxies()
        ]
        print(json.dumps({"data": data, "count": len(data)}, ensure_ascii=True, indent=2))
        return 0

    if args.proxy_cmd == "count":
        print(json.dumps(client.count_inside_proxies(), ensure_ascii=True, indent=2))
        return 0

    if args.proxy_cmd == "rotate":
        try:
            print(json.dumps(client.change_ip([args.code]), ensure_ascii=True, indent=2))
        except ProxyXoayHttpError as exc:
            if exc.status_code == 400 and exc.wait_seconds:
                print(json.dumps({
                    "success": False,
                    "cooldown": True,
                    "wait_seconds": exc.wait_seconds,
                    "message": exc.response_text or str(exc),
                }, ensure_ascii=True, indent=2))
                return 0
            raise
        return 0

    if args.proxy_cmd == "rotate-auto":
        vms = client.list_inside_proxies()
        if not vms:
            print(json.dumps({"success": False, "message": "No proxy VM found"}, ensure_ascii=True, indent=2))
            return 1
        code = vms[0].proxy_code
        try:
            data = client.change_ip([code])
            print(json.dumps({"success": True, "proxy_code": code, "response": data}, ensure_ascii=True, indent=2))
        except ProxyXoayHttpError as exc:
            if exc.status_code == 400 and exc.wait_seconds:
                print(json.dumps({
                    "success": False,
                    "cooldown": True,
                    "proxy_code": code,
                    "wait_seconds": exc.wait_seconds,
                    "message": exc.response_text or str(exc),
                }, ensure_ascii=True, indent=2))
                return 0
            raise
        return 0

    if args.proxy_cmd == "renew":
        codes = [x.strip() for x in args.codes.split(",") if x.strip()]
        print(json.dumps(client.renew_now_multiple(codes), ensure_ascii=True, indent=2))
        return 0

    return 2


def cmd_manual(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    start_url = args.url.strip() or None
    run_manual_session(
        cfg,
        start_url=start_url,
        snapshot_dir=args.snapshot_dir,
        skip_rotate=args.skip_rotate,
    )
    return 0



def main() -> int:
    setup_logging()
    parser = _parser()
    args = parser.parse_args()

    try:
        if args.command == "run":
            return cmd_run(args)
        if args.command == "import-excel":
            return cmd_import(args)
        if args.command == "watch":
            return cmd_watch(args)
        if args.command == "worker":
            return cmd_worker(args)
        if args.command == "scheduler":
            return cmd_scheduler(args)
        if args.command == "proxy":
            return cmd_proxy(args)
        if args.command == "manual":
            return cmd_manual(args)
        if args.command == "queue":
            return cmd_queue(args)
        parser.error("Unknown command")
        return 2
    except ConfigError as exc:
        logger.error("Config error: %s", exc)
        return 2
    except ManualSessionError as exc:
        logger.error("Manual session error: %s", exc)
        return 2
    except ProxyXoayError as exc:
        logger.error("ProxyXoay error: %s", exc)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
