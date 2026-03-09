from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from irs_bot.config import (
    AppConfig,
    ProxyRuntimeConfig,
    ProxyXoayAuthConfig,
    ProxyXoayConfig,
)
from irs_bot.excel_ingest import load_csv_rows, validate_rows


class ExcelIngestTests(unittest.TestCase):
    def _config(self) -> AppConfig:
        return AppConfig(
            target_url="https://example.com",
            required_columns=["record_id", "legal_structure"],
            proxyxoay=ProxyXoayConfig(
                base_url="https://id.proxyxoay.net",
                auth=ProxyXoayAuthConfig(
                    login_endpoint="/api/v1/auth/login",
                    username="u",
                    password="p",
                ),
            ),
            proxy_runtime=ProxyRuntimeConfig(
                host="proxy",
                port=8178,
                username="a",
                password="b",
            ),
        )

    def test_load_csv_and_validate(self) -> None:
        cfg = self._config()
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "input.csv"
            with path.open("w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=["record_id", "legal_structure"])
                writer.writeheader()
                writer.writerow({"record_id": "r1", "legal_structure": "sole"})
            rows = load_csv_rows(path)
            errors = validate_rows(rows, cfg)
            self.assertEqual(errors, [])

    def test_validate_missing_required(self) -> None:
        cfg = self._config()
        rows = [{"record_id": "r1", "legal_structure": ""}]
        errors = validate_rows(rows, cfg)
        self.assertTrue(errors)

    def test_alias_county_and_name_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "input.csv"
            headers = [
                "NAME",
                "SSN",
                "DOB",
                "GENDER",
                "ADDRESS",
                "CITI",
                "BANG",
                "ZIP",
                "Phone",
                "County where Sole Proprietor is located",
            ]
            with path.open("w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=headers)
                writer.writeheader()
                writer.writerow(
                    {
                        "NAME": '"Jazmin\t\tMorales"',
                        "SSN": "609701109",
                        "DOB": "12021993",
                        "GENDER": "F",
                        "ADDRESS": "1000 Evergreen Ter APT 1310",
                        "CITI": "San Pablo",
                        "BANG": "CA",
                        "ZIP": "94806",
                        "Phone": "5102379047",
                        "County where Sole Proprietor is located": "Contra Costa County",
                    }
                )
            rows = load_csv_rows(path)
            self.assertEqual(len(rows), 1)
            row = rows[0]
            self.assertEqual(str(row.get("NAME")), "Jazmin Morales")
            self.assertEqual(str(row.get("county")), "Contra Costa County")


if __name__ == "__main__":
    unittest.main()
