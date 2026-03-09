from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import os
import re
from typing import Any, Dict, List, Optional


@dataclass
class ProxyXoayAuthConfig:
    login_endpoint: str
    username: str
    password: str
    access_token: str = ""


@dataclass
class ProxyXoayConfig:
    base_url: str
    tenant: str = "proxyxoay"
    timezone: str = "7"
    vm_type: str = "ROTATING_PROXY_4G"
    type_search: str = "NORMAL"
    auth: Optional[ProxyXoayAuthConfig] = None


@dataclass
class ProxyRuntimeConfig:
    host: str
    port: int
    username: str
    password: str
    rotate_url: str = ""
    change_ip_wait_seconds: int = 15
    healthcheck_url: str = "https://api.ipify.org?format=json"
    skip_healthcheck: bool = False


@dataclass
class RetryConfig:
    max_retries_per_record: int = 2
    base_backoff_seconds: int = 5
    max_attempt_seconds: int = 240


@dataclass
class SubmitGuardConfig:
    two_step_confirm: bool = True
    require_tty: bool = True


@dataclass
class CaptureConfig:
    checkpoints: List[str] = field(default_factory=lambda: ["loaded", "filled", "review", "submitted"])


@dataclass
class QueueConfig:
    queue_high: str = "ein.high"
    queue_default: str = "ein.default"
    queue_retry: str = "ein.retry"
    queue_manual: str = "ein.manual"
    queue_timezone: str = "Asia/Ho_Chi_Minh"
    queue_country: str = "VN"
    queue_start_hour: int = 18
    watch_poll_seconds: int = 7
    file_stable_seconds: int = 3


@dataclass
class OutputConfig:
    artifacts_dir: str = "artifacts"
    state_dir: str = "state"
    output_csv: str = "outputs/results.csv"
    keep_debug_artifacts: bool = False


@dataclass
class BrowserConfig:
    headless: bool = False
    force_background_headless: bool = True
    timeout_ms: int = 30000
    step_delay_ms: int = 180
    step_delay_jitter_ms: int = 120
    manual_window_width: int = 1600
    manual_window_height: int = 960
    manual_autosave_seconds: float = 1.0
    block_keywords: List[str] = field(default_factory=lambda: ["captcha", "verify you are human", "blocked"])


@dataclass
class WorkflowStep:
    name: str
    action: str
    selector: str = ""
    field: str = ""
    value: str = ""
    timeout_ms: Optional[int] = None


@dataclass
class AppConfig:
    target_url: str
    required_columns: List[str]
    proxyxoay: ProxyXoayConfig
    proxy_runtime: ProxyRuntimeConfig
    queue: QueueConfig = field(default_factory=QueueConfig)
    retry: RetryConfig = field(default_factory=RetryConfig)
    submit_guard: SubmitGuardConfig = field(default_factory=SubmitGuardConfig)
    capture: CaptureConfig = field(default_factory=CaptureConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    browser: BrowserConfig = field(default_factory=BrowserConfig)
    sandbox: bool = False
    selectors: Dict[str, str] = field(default_factory=dict)
    workflow: List[WorkflowStep] = field(default_factory=list)


class ConfigError(RuntimeError):
    pass


def _require(d: Dict[str, Any], key: str, section: str) -> Any:
    if key not in d:
        raise ConfigError(f"Missing required key '{section}.{key}'")
    return d[key]


def _normalize_runtime_path(raw: str) -> str:
    value = str(raw or "").strip()
    if not value:
        return value
    if os.name == "nt":
        return value
    match = re.match(r"^([a-zA-Z]):[\\/](.*)$", value)
    if not match:
        return value
    drive = match.group(1).lower()
    rest = match.group(2).replace("\\", "/")
    return f"/mnt/{drive}/{rest}"


def load_config(path: str | Path) -> AppConfig:
    try:
        import yaml
    except ImportError as exc:  # pragma: no cover
        raise ConfigError("Missing dependency: pyyaml") from exc

    cfg_path = Path(path)
    if not cfg_path.exists():
        raise ConfigError(f"Config not found: {cfg_path}")

    data = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ConfigError("Config root must be a mapping")

    target_url = _require(data, "target_url", "root")
    required_columns = _require(data, "required_columns", "root")

    pxy = _require(data, "proxyxoay", "root")
    auth = pxy.get("auth") or {}
    auth_cfg = ProxyXoayAuthConfig(
        login_endpoint=_require(auth, "login_endpoint", "proxyxoay.auth"),
        username=_require(auth, "username", "proxyxoay.auth"),
        password=_require(auth, "password", "proxyxoay.auth"),
        access_token=str(auth.get("access_token", "") or ""),
    )
    proxyxoay_cfg = ProxyXoayConfig(
        base_url=_require(pxy, "base_url", "proxyxoay"),
        tenant=pxy.get("tenant", "proxyxoay"),
        timezone=str(pxy.get("timezone", "7")),
        vm_type=pxy.get("vm_type", "ROTATING_PROXY_4G"),
        type_search=pxy.get("type_search", "NORMAL"),
        auth=auth_cfg,
    )

    runtime = _require(data, "proxy_runtime", "root")
    runtime_cfg = ProxyRuntimeConfig(
        host=_require(runtime, "host", "proxy_runtime"),
        port=int(_require(runtime, "port", "proxy_runtime")),
        username=_require(runtime, "username", "proxy_runtime"),
        password=_require(runtime, "password", "proxy_runtime"),
        rotate_url=str(runtime.get("rotate_url", "") or ""),
        change_ip_wait_seconds=int(runtime.get("change_ip_wait_seconds", 15)),
        healthcheck_url=runtime.get("healthcheck_url", "https://api.ipify.org?format=json"),
        skip_healthcheck=bool(runtime.get("skip_healthcheck", False)),
    )

    queue_cfg = QueueConfig(**(data.get("queue") or {}))
    retry_cfg = RetryConfig(**(data.get("retry") or {}))
    submit_guard_cfg = SubmitGuardConfig(**(data.get("submit_guard") or {}))
    capture_cfg = CaptureConfig(**(data.get("capture") or {}))
    output_cfg = OutputConfig(**(data.get("output") or {}))
    output_cfg.artifacts_dir = _normalize_runtime_path(output_cfg.artifacts_dir)
    output_cfg.state_dir = _normalize_runtime_path(output_cfg.state_dir)
    output_cfg.output_csv = _normalize_runtime_path(output_cfg.output_csv)
    browser_cfg = BrowserConfig(**(data.get("browser") or {}))

    workflow_steps = []
    for step in data.get("workflow") or []:
        workflow_steps.append(WorkflowStep(**step))

    selectors = data.get("selectors") or {}

    return AppConfig(
        target_url=target_url,
        required_columns=list(required_columns),
        proxyxoay=proxyxoay_cfg,
        proxy_runtime=runtime_cfg,
        queue=queue_cfg,
        retry=retry_cfg,
        submit_guard=submit_guard_cfg,
        capture=capture_cfg,
        output=output_cfg,
        browser=browser_cfg,
        sandbox=bool(data.get("sandbox", False)),
        selectors=selectors,
        workflow=workflow_steps,
    )
