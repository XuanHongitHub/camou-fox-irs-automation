from __future__ import annotations

import unittest

from irs_bot.runner import (
    _normalize_county,
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
            "12 Main St 5 / Apt B",
        )

    def test_sanitize_address_rewrites_po_box_for_physical_street(self) -> None:
        self.assertEqual(_sanitize_address("P.O. Box #2216"), "BOX 2216")
        self.assertEqual(_sanitize_address("PO Box 64"), "BOX 64")
        self.assertEqual(_sanitize_address("P O BOX 5791"), "BOX 5791")

    def test_sanitize_city_removes_digits_and_noise(self) -> None:
        self.assertEqual(_sanitize_city("San P4blo@@"), "San P blo")

    def test_normalize_county_strips_county_and_parish_suffixes(self) -> None:
        self.assertEqual(_normalize_county("St. Francis County"), "St. Francis")
        self.assertEqual(_normalize_county("East Baton Rouge Parish"), "East Baton Rouge")
        self.assertEqual(_normalize_county("East Baton Rouge Parish County"), "East Baton Rouge")

    def test_hard_fail_message_for_online_assistant_form_ss4_copy(self) -> None:
        class FakePage:
            def inner_text(self, _selector: str) -> str:
                return (
                    "We apologize for the inconvenience but based on the information provided "
                    "we are unable to provide you with an EIN through this online assistant. "
                    "You must submit a Form SS-4 by fax or mail."
                )

        from irs_bot.runner import _irs_hard_fail_message

        self.assertIn("Form SS-4", _irs_hard_fail_message(FakePage()))


if __name__ == "__main__":
    unittest.main()
