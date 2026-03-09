from __future__ import annotations

import logging
import sqlite3
import json
import time
import re
from typing import Any, Dict, Iterable, List, Optional
from pathlib import Path

from .config import AppConfig

logger = logging.getLogger(__name__)


def _slug(s: str) -> str:
    out = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return out[:48] or "row"


def _auto_record_id(record: Dict[str, Any], row_index: int) -> str:
    name = str(record.get("NAME") or record.get("name") or "").strip()
    ssn = re.sub(r"\D", "", str(record.get("SSN") or record.get("ssn") or ""))
    city = str(record.get("CITI") or record.get("city") or "").strip()
    token = "-".join(x for x in [_slug(name), _slug(city), ssn[-4:] if ssn else "0000"] if x)
    return f"rec-{row_index:04d}-{token}"[:96]

class QueueError(RuntimeError):
    pass

def _get_db_path(config: AppConfig) -> str:
    # Use the output state dir to keep the db
    state_dir = Path(config.output.state_dir)
    state_dir.mkdir(parents=True, exist_ok=True)
    return str(state_dir / "queue.db")

def init_db(config: AppConfig):
    """Initializes the SQLite database with the jobs table."""
    db_path = _get_db_path(config)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            queue_name TEXT,
            status TEXT,
            payload TEXT,
            created_at REAL,
            updated_at REAL
        )
    ''')
    conn.commit()
    conn.close()

def enqueue_records(
    config: AppConfig,
    batch_id: str,
    source_file: str,
    records: Iterable[Dict[str, Any]],
    queue_name: str | None = None,
) -> List[str]:
    init_db(config)
    conn = sqlite3.connect(_get_db_path(config))
    cur = conn.cursor()
    
    q_name = queue_name or config.queue.queue_default
    job_ids: List[str] = []
    
    now = time.time()
    
    for idx, record in enumerate(records, start=1):
        record_id = str(record.get("record_id") or "").strip()
        if not record_id:
            record_id = _auto_record_id(record, idx)
            record["record_id"] = record_id
            
        payload = {
            "batch_id": batch_id,
            "source_file": source_file,
            "record": record,
            "sandbox": q_name == config.queue.queue_manual or "sandbox" in q_name.lower(),
        }
        
        job_id = f"{batch_id}:{record_id}"
        
        # Insert or ignore if it already exists to avoid dupes purely on basic queues
        cur.execute('''
            INSERT OR IGNORE INTO jobs (job_id, queue_name, status, payload, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (job_id, q_name, 'pending', json.dumps(payload), now, now))
        
        job_ids.append(job_id)

    conn.commit()
    conn.close()
    
    logger.info("Enqueued %s jobs into SQLite queue '%s'", len(job_ids), q_name)
    return job_ids

def get_next_job(config: AppConfig, queue_names: List[str]) -> Optional[Dict[str, Any]]:
    """Atomically claim one pending job from target queues."""
    if not queue_names:
        return None

    db_path = _get_db_path(config)
    placeholders = ",".join(["?"] * len(queue_names))

    # Retry briefly on lock/race contention when multiple workers poll together.
    for _ in range(5):
        conn = sqlite3.connect(db_path, timeout=30.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        try:
            cur.execute("BEGIN IMMEDIATE")
            cur.execute(
                f"""
                SELECT * FROM jobs
                WHERE queue_name IN ({placeholders}) AND status = 'pending'
                ORDER BY created_at ASC
                LIMIT 1
                """,
                queue_names,
            )
            row = cur.fetchone()
            if not row:
                cur.execute("COMMIT")
                return None

            job = dict(row)
            now = time.time()
            cur.execute(
                "UPDATE jobs SET status = 'running', updated_at = ? WHERE job_id = ? AND status = 'pending'",
                (now, job["job_id"]),
            )
            if cur.rowcount != 1:
                cur.execute("ROLLBACK")
                time.sleep(0.02)
                continue
            cur.execute("COMMIT")

            try:
                job["payload"] = json.loads(job.get("payload") or "{}")
            except Exception:
                job["payload"] = {}
            return job
        except sqlite3.OperationalError:
            try:
                cur.execute("ROLLBACK")
            except Exception:
                pass
            time.sleep(0.03)
            continue
        finally:
            conn.close()

    return None

def update_job_status(config: AppConfig, job_id: str, status: str):
    conn = sqlite3.connect(_get_db_path(config))
    cur = conn.cursor()
    cur.execute("UPDATE jobs SET status = ?, updated_at = ? WHERE job_id = ?", (status, time.time(), job_id))
    conn.commit()
    conn.close()


def update_job_status_and_queue(config: AppConfig, job_id: str, status: str, queue_name: str):
    conn = sqlite3.connect(_get_db_path(config))
    cur = conn.cursor()
    cur.execute(
        "UPDATE jobs SET status = ?, queue_name = ?, updated_at = ? WHERE job_id = ?",
        (status, queue_name, time.time(), job_id),
    )
    conn.commit()
    conn.close()


def list_jobs(config: AppConfig, queue_names: Optional[List[str]] = None, statuses: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    init_db(config)
    conn = sqlite3.connect(_get_db_path(config))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    clauses: List[str] = []
    params: List[Any] = []
    if queue_names:
        placeholders = ",".join(["?"] * len(queue_names))
        clauses.append(f"queue_name IN ({placeholders})")
        params.extend(queue_names)
    if statuses:
        placeholders = ",".join(["?"] * len(statuses))
        clauses.append(f"status IN ({placeholders})")
        params.extend(statuses)

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    cur.execute(
        f"""
        SELECT job_id, queue_name, status, payload, created_at, updated_at
        FROM jobs
        {where_sql}
        ORDER BY created_at ASC
        """,
        params,
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    for row in rows:
        try:
            row["payload"] = json.loads(row.get("payload") or "{}")
        except Exception:
            row["payload"] = {}
    return rows


def delete_jobs(config: AppConfig, job_ids: List[str]) -> int:
    if not job_ids:
        return 0
    init_db(config)
    conn = sqlite3.connect(_get_db_path(config))
    cur = conn.cursor()
    placeholders = ",".join(["?"] * len(job_ids))
    cur.execute(f"DELETE FROM jobs WHERE job_id IN ({placeholders})", job_ids)
    count = cur.rowcount
    conn.commit()
    conn.close()
    return int(count or 0)


def requeue_jobs(config: AppConfig, job_ids: List[str]) -> int:
    if not job_ids:
        return 0
    init_db(config)
    conn = sqlite3.connect(_get_db_path(config))
    cur = conn.cursor()
    placeholders = ",".join(["?"] * len(job_ids))
    now = time.time()
    cur.execute(
        f"UPDATE jobs SET status = 'pending', updated_at = ? WHERE job_id IN ({placeholders})",
        [now, *job_ids],
    )
    count = cur.rowcount
    conn.commit()
    conn.close()
    return int(count or 0)


def recover_stale_running_jobs(config: AppConfig, stale_seconds: int = 900) -> int:
    """Move running jobs back to pending.
    stale_seconds <= 0 means recover all running jobs immediately.
    """
    init_db(config)
    conn = sqlite3.connect(_get_db_path(config))
    cur = conn.cursor()
    now = time.time()
    if int(stale_seconds) <= 0:
        cur.execute(
            """
            UPDATE jobs
            SET status = 'pending', updated_at = ?
            WHERE status = 'running'
            """,
            (now,),
        )
    else:
        threshold = now - max(30, int(stale_seconds))
        cur.execute(
            """
            UPDATE jobs
            SET status = 'pending', updated_at = ?
            WHERE status = 'running' AND updated_at < ?
            """,
            (now, threshold),
        )
    count = cur.rowcount
    conn.commit()
    conn.close()
    return int(count or 0)


def normalize_manual_pending_jobs(config: AppConfig) -> int:
    """
    Manual queue is operator-only. Any pending rows there should be marked as
    manual_required so auto worker loops do not get blocked by legacy data.
    """
    init_db(config)
    conn = sqlite3.connect(_get_db_path(config))
    cur = conn.cursor()
    now = time.time()
    cur.execute(
        """
        UPDATE jobs
        SET status = 'manual_required', updated_at = ?
        WHERE queue_name = ? AND status = 'pending'
        """,
        (now, config.queue.queue_manual),
    )
    count = cur.rowcount
    conn.commit()
    conn.close()
    return int(count or 0)

def requeue_failed_jobs(config: AppConfig, queue_name: str | None = None) -> int:
    """Move failed jobs back to pending, returns requeued count."""
    conn = sqlite3.connect(_get_db_path(config))
    cur = conn.cursor()
    
    src_name = queue_name or config.queue.queue_default
    
    cur.execute('''
        UPDATE jobs 
        SET status = 'pending', queue_name = ?, updated_at = ?
        WHERE queue_name = ? AND status = 'failed'
    ''', (config.queue.queue_retry, time.time(), src_name))
    
    count = cur.rowcount
    conn.commit()
    conn.close()

    return count

def enqueue_manual_record(
    config: AppConfig,
    batch_id: str,
    source_file: str,
    record: Dict[str, Any],
    reason: str,
) -> str:
    init_db(config)
    conn = sqlite3.connect(_get_db_path(config))
    cur = conn.cursor()
    
    record_id = str(record.get("record_id", "")).strip() or "unknown"
    job_id = f"manual:{batch_id}:{record_id}"
    
    payload = {
        "batch_id": batch_id,
        "source_file": source_file,
        "record": record,
        "reason": reason,
    }
    
    now = time.time()
    cur.execute('''
        INSERT OR IGNORE INTO jobs (job_id, queue_name, status, payload, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (job_id, config.queue.queue_manual, 'pending', json.dumps(payload), now, now))
    
    conn.commit()
    conn.close()
    return job_id
