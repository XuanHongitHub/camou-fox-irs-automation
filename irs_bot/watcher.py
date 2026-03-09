from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Set

from .config import AppConfig
from .ingest_pipeline import import_file_to_queue

logger = logging.getLogger(__name__)



def _is_file_stable(path: Path, stable_seconds: int) -> bool:
    stat = path.stat()
    age = time.time() - stat.st_mtime
    return age >= stable_seconds



def watch_inbox(
    config: AppConfig,
    inbox_dir: str | Path,
    archive_dir: str | Path,
    error_dir: str | Path,
    sheet_name: str = "records",
) -> None:
    inbox = Path(inbox_dir)
    inbox.mkdir(parents=True, exist_ok=True)

    processed: Set[str] = set()
    logger.info("Watching inbox: %s", inbox)

    while True:
        for path in sorted(inbox.glob("*")):
            if not path.is_file():
                continue
            if path.suffix.lower() not in {".xlsx", ".xls", ".csv"}:
                continue
            if str(path) in processed:
                continue
            if not _is_file_stable(path, config.queue.file_stable_seconds):
                continue

            logger.info("Ingesting %s", path)
            batch_id, job_ids = import_file_to_queue(
                config=config,
                input_file=path,
                archive_dir=archive_dir,
                error_dir=error_dir,
                sheet_name=sheet_name,
                queue_name=config.queue.queue_default,
            )
            logger.info("Batch %s: enqueued %d jobs", batch_id, len(job_ids))
            processed.add(str(path))

        time.sleep(config.queue.watch_poll_seconds)
