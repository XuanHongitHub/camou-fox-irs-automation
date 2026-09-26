from __future__ import annotations

import unittest

from irs_bot.worker_jobs import (
    _is_non_retryable_business_rule,
    _is_non_retryable_validation_failure,
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

    def test_proxy_refused_is_retryable(self) -> None:
        self.assertTrue(_is_transient_retryable("runtime", "Page.goto: NS_ERROR_PROXY_CONNECTION_REFUSED"))

    def test_po_box_validation_is_not_retryable(self) -> None:
        self.assertTrue(
            _is_non_retryable_validation_failure(
                "step3_validation",
                "Street: P.O. Boxes are not permitted. (physical)",
            )
        )

    def test_online_assistant_hard_fail_is_not_retryable(self) -> None:
        self.assertTrue(
            _is_non_retryable_business_rule(
                "irs_hard_fail",
                "We are unable to provide you with an EIN through this online assistant. You must submit a Form SS-4 by fax or mail.",
            )
        )


if __name__ == "__main__":
    unittest.main()
