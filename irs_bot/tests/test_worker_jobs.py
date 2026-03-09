from __future__ import annotations

import unittest

from irs_bot.worker_jobs import (
    _is_transient_retryable,
    _retry_backoff_seconds,
    _should_ban_proxy,
)


class WorkerJobsRetryTests(unittest.TestCase):
    def test_transient_timeout_is_retryable(self) -> None:
        self.assertTrue(_is_transient_retryable("step3_addresses", "Timeout 30000ms exceeded"))

    def test_missing_button_is_retryable(self) -> None:
        self.assertTrue(_is_transient_retryable("step1_legal_structure", "Cannot find Continue button on step 1"))

    def test_proxy_healthcheck_bans_proxy(self) -> None:
        self.assertTrue(_should_ban_proxy("proxy_healthcheck", "Proxy healthcheck failed"))

    def test_button_render_delay_does_not_ban_proxy(self) -> None:
        self.assertFalse(_should_ban_proxy("step5_review_submit", "Cannot find Submit EIN Request button"))

    def test_retry_backoff_is_linear(self) -> None:
        self.assertEqual(_retry_backoff_seconds(5, 3), 15)


if __name__ == "__main__":
    unittest.main()
