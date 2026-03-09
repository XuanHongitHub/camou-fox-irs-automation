from __future__ import annotations

import unittest
from unittest import mock

from irs_bot.runner import confirm_submit


class ConfirmTests(unittest.TestCase):
    def test_confirm_submit_rejects_non_tty(self) -> None:
        with mock.patch("sys.stdin.isatty", return_value=False):
            self.assertFalse(confirm_submit("r1", require_tty=True))

    def test_confirm_submit_accepts_valid_inputs(self) -> None:
        with mock.patch("sys.stdin.isatty", return_value=True):
            with mock.patch("builtins.input", side_effect=["r1", "SUBMIT"]):
                self.assertTrue(confirm_submit("r1", require_tty=True))


if __name__ == "__main__":
    unittest.main()
