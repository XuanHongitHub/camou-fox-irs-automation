from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    RETRYABLE_FAIL = "retryable_fail"
    MANUAL_REQUIRED = "manual_required"
    VALIDATION_FAILED = "validation_failed"
    CANCELLED = "cancelled"


@dataclass
class ProxyEndpoint:
    proxy_code: str
    host: str
    port: int
    username: str
    password: str
    scheme: str = "http"

    @property
    def server(self) -> str:
        scheme = str(self.scheme or "http").strip().lower()
        if scheme not in {"http", "https", "socks5", "socks5h", "socks4", "socks4a"}:
            scheme = "http"
        return f"{scheme}://{self.host}:{self.port}"


@dataclass
class ProxyRotationResult:
    proxy_code: str
    status: str
    message: str
    old_ip: Optional[str] = None
    new_ip: Optional[str] = None
    changed_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class RecordRunContext:
    batch_id: str
    record_id: str
    attempt_no: int
    source_file: str
    artifact_dir: Path
    proxy_code: Optional[str] = None
    session_id: Optional[str] = None


@dataclass
class JobResult:
    batch_id: str
    record_id: str
    record_name: str
    status: JobStatus
    attempt_count: int
    proxy_used: str
    proxy_ip: str
    started_at: str
    ended_at: str
    last_step: str
    artifact_dir: str
    error_type: str = ""
    error_code: str = ""
    error_message: str = ""
    confirmation_number: str = ""
    step6_ein: str = ""
    step6_legal_name: str = ""
    step6_name_control: str = ""
    step6_phone_number: str = ""
    step6_county: str = ""
    step6_state: str = ""
    step6_start_date: str = ""
    step6_principal_activity: str = ""
    step6_principal_product_service: str = ""
    step6_reason_for_applying: str = ""
    step6_physical_location: str = ""
    step6_responsible_name: str = ""
    step6_responsible_ssn_itin: str = ""
    step6_data_json: str = ""
    pdf_path: str = ""
    final_pdf_path: str = ""

    def to_row(self) -> Dict[str, Any]:
        return {
            "batch_id": self.batch_id,
            "record_id": self.record_id,
            "record_name": self.record_name,
            "status": self.status.value,
            "attempt_count": self.attempt_count,
            "proxy_used": self.proxy_used,
            "proxy_ip": self.proxy_ip,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "last_step": self.last_step,
            "artifact_dir": self.artifact_dir,
            "error_type": self.error_type,
            "error_code": self.error_code,
            "error_message": self.error_message,
            "confirmation_number": self.confirmation_number,
            "step6_ein": self.step6_ein,
            "step6_legal_name": self.step6_legal_name,
            "step6_name_control": self.step6_name_control,
            "step6_phone_number": self.step6_phone_number,
            "step6_county": self.step6_county,
            "step6_state": self.step6_state,
            "step6_start_date": self.step6_start_date,
            "step6_principal_activity": self.step6_principal_activity,
            "step6_principal_product_service": self.step6_principal_product_service,
            "step6_reason_for_applying": self.step6_reason_for_applying,
            "step6_physical_location": self.step6_physical_location,
            "step6_responsible_name": self.step6_responsible_name,
            "step6_responsible_ssn_itin": self.step6_responsible_ssn_itin,
            "step6_data_json": self.step6_data_json,
            "pdf_path": self.pdf_path,
            "final_pdf_path": self.final_pdf_path,
        }
