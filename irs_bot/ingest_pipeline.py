from __future__ import annotations

import logging
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .config import AppConfig
from .excel_ingest import ExcelIngestError, build_batch, load_csv_rows, load_excel_rows, validate_rows
from .queueing import enqueue_records
from .storage import write_json

logger = logging.getLogger(__name__)


def _safe_move(src: Path, dst: Path) -> None:
    try:
        if not src.exists():
            logger.warning("Skip move, source missing: %s", src)
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
    except Exception:
        logger.exception("Failed moving %s -> %s", src, dst)



def generate_batch_id(prefix: str = "batch") -> str:
    ts = time.strftime("%Y%m%d-%H%M%S")
    return f"{prefix}-{ts}-{uuid.uuid4().hex[:8]}"



def import_file_to_queue(
    config: AppConfig,
    input_file: str | Path,
    archive_dir: str | Path,
    error_dir: str | Path,
    sheet_name: str = "records",
    queue_name: str | None = None,
) -> Tuple[str, List[str]]:
    src = Path(input_file)
    archive = Path(archive_dir)
    error = Path(error_dir)
    archive.mkdir(parents=True, exist_ok=True)
    error.mkdir(parents=True, exist_ok=True)

    batch_id = generate_batch_id()

    try:
        if src.suffix.lower() == ".csv":
            rows = load_csv_rows(src)
        else:
            rows = load_excel_rows(src, sheet_name=sheet_name)

        errors = validate_rows(rows, config)
        if errors:
            report = {
                "batch_id": batch_id,
                "source_file": str(src),
                "errors": errors,
            }
            write_json(Path(config.output.state_dir) / "errors" / f"{batch_id}.json", report)
            _safe_move(src, error / src.name)
            return batch_id, []

        batch = build_batch(rows, source_file=str(src), batch_id=batch_id)
        job_ids = enqueue_records(config, batch.batch_id, batch.source_file, batch.rows, queue_name)
        write_json(
            Path(config.output.state_dir) / "batches" / f"{batch_id}.json",
            {
                "batch_id": batch_id,
                "source_file": str(src),
                "records": len(batch.rows),
                "job_ids": job_ids,
            },
        )
        _safe_move(src, archive / src.name)
        return batch_id, job_ids

    except ExcelIngestError as exc:
        logger.error("Excel ingest failed for %s: %s", src, exc)
        write_json(
            Path(config.output.state_dir) / "errors" / f"{batch_id}.json",
            {
                "batch_id": batch_id,
                "source_file": str(src),
                "errors": [str(exc)],
            },
        )
        _safe_move(src, error / src.name)
        return batch_id, []
    except Exception as exc:
        logger.exception("Import failed for %s", src)
        write_json(
            Path(config.output.state_dir) / "errors" / f"{batch_id}.json",
            {
                "batch_id": batch_id,
                "source_file": str(src),
                "errors": [str(exc)],
            },
        )
        _safe_move(src, error / src.name)
        return batch_id, []
