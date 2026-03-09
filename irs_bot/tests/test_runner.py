from __future__ import annotations

import unittest

from irs_bot.runner import (
    _sanitize_address,
    _sanitize_city,
    _sanitize_name_part,
)


class RunnerSanitizeTests(unittest.TestCase):
    def test_sanitize_middle_name_removes_validation_noise(self) -> None:
        self.assertEqual(_sanitize_name_part('An@   N!a123'), "An N a")

    def test_sanitize_address_removes_invalid_symbols(self) -> None:
        self.assertEqual(
            _sanitize_address('12<> Main St. #5 / Apt "B"'),
            "12 Main St. #5 / Apt B",
        )

    def test_sanitize_city_removes_digits_and_noise(self) -> None:
        self.assertEqual(_sanitize_city("San P4blo@@"), "San P blo")


if __name__ == "__main__":
    unittest.main()
