from __future__ import annotations

import logging
import time

from .config import AppConfig
from .proxyxoay_client import ProxyXoayClient
from .queueing import requeue_failed_jobs

logger = logging.getLogger(__name__)



def run_scheduler_once(config: AppConfig) -> None:
    requeued = requeue_failed_jobs(config)
    if requeued:
        logger.info("Requeued %d failed jobs", requeued)



def renew_expiring_once(config: AppConfig, vm_codes: list[str]) -> dict:
    client = ProxyXoayClient(config.proxyxoay)
    if not vm_codes:
        return {"success": True, "message": "No VM codes provided", "data": []}
    result = client.renew_now_multiple(vm_codes)
    logger.info("Renew result: %s", result)
    return result



def run_scheduler_loop(config: AppConfig, interval_seconds: int = 60) -> None:
    logger.info("Scheduler loop started with interval=%ss", interval_seconds)
    while True:
        try:
            run_scheduler_once(config)
        except Exception:
            logger.exception("Scheduler tick failed")
        time.sleep(interval_seconds)
