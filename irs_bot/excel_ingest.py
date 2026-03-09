from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import AppConfig
from .xlsx_minimal import XlsxParseError, read_xlsx_rows


class ExcelIngestError(RuntimeError):
    pass


@dataclass
class IngestBatch:
    batch_id: str
    source_file: str
    rows: List[Dict[str, Any]]



def _normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    def _clean_text(v: str) -> str:
        # Normalize tabs/newlines and strip wrapping quotes from imported text cells.
        s = str(v).replace("\ufeff", "").replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()
        if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
            s = s[1:-1].strip()
        s = " ".join(s.split())
        return s

    out: Dict[str, Any] = {}
    for key, value in row.items():
        if value is None:
            out[key] = ""
            continue
        # pandas NaN normalization without importing numpy directly
        if isinstance(value, float) and str(value) == "nan":
            out[key] = ""
            continue
        if isinstance(value, str):
            out[key] = _clean_text(value)
            continue
        out[key] = value
    return out


def _normalize_header_key(raw: str) -> str:
    s = str(raw or "").strip().lstrip("\ufeff").lower()
    for ch in (" ", "_", "-", ".", "/", "\\", "(", ")", "[", "]"):
        s = s.replace(ch, "")
    return s


def _canonical_header(raw: str) -> str:
    n = _normalize_header_key(raw)
    aliases = {
        "recordid": "record_id",
        "record": "record_id",
        "id": "record_id",
        "name": "NAME",
        "fullname": "NAME",
        "ownername": "NAME",
        "ssn": "SSN",
        "socialsecuritynumber": "SSN",
        "itin": "SSN",
        "dob": "DOB",
        "dateofbirth": "DOB",
        "birthdate": "DOB",
        "gender": "GENDER",
        "sex": "GENDER",
        "address": "ADDRESS",
        "street": "ADDRESS",
        "streetaddress": "ADDRESS",
        "citi": "CITI",
        "city": "CITI",
        "bang": "BANG",
        "state": "BANG",
        "statecode": "BANG",
        "province": "BANG",
        "zip": "ZIP",
        "zipcode": "ZIP",
        "postalcode": "ZIP",
        "phone": "Phone",
        "phonenumber": "Phone",
        "mobile": "Phone",
        "country": "country",
        "county": "county",
        "countywheresoleproprietorislocated": "county",
        "soleproprietorcounty": "county",
    }
    return aliases.get(n, str(raw or "").strip())


def _canonicalize_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for row in rows:
        normalized = _normalize_row(row)
        merged: Dict[str, Any] = {}
        for k, v in normalized.items():
            ck = _canonical_header(str(k))
            if ck not in merged or str(merged.get(ck, "")).strip() == "":
                merged[ck] = v
        out.append(merged)
    return out


def load_excel_rows(path: str | Path, sheet_name: str = "records") -> List[Dict[str, Any]]:
    src = Path(path)
    if not src.exists():
        raise ExcelIngestError(f"Excel file not found: {src}")

    pandas_exc: Exception | None = None
    try:
        import pandas as pd

        try:
            df = pd.read_excel(src, sheet_name=sheet_name, dtype=object)
        except ValueError:
            df = pd.read_excel(src, sheet_name=0, dtype=object)
        rows = [
            _normalize_row({k: v for k, v in row.items()})
            for row in df.to_dict(orient="records")
        ]
        return _canonicalize_rows(rows)
    except Exception as exc:
        pandas_exc = exc

    # Fallback parser for environments without pandas/openpyxl packages
    # or files that pandas cannot identify automatically.
    try:
        sheet = read_xlsx_rows(src, sheet_name=sheet_name)
        return _canonicalize_rows([_normalize_row(dict(row)) for row in sheet.rows])
    except XlsxParseError as xlsx_exc:
        # Last fallback: some upstream flows may write CSV content with .xlsx extension.
        try:
            import csv

            with src.open("r", newline="", encoding="utf-8-sig") as f:
                rows = [_normalize_row(row) for row in csv.DictReader(f)]
            if rows:
                return _canonicalize_rows(rows)
        except Exception:
            pass
        detail = f"pandas={pandas_exc}; xlsx_parser={xlsx_exc}"
        raise ExcelIngestError(f"Cannot parse excel input: {src} ({detail})") from xlsx_exc


def validate_rows(rows: List[Dict[str, Any]], config: AppConfig) -> List[str]:
    errors: List[str] = []
    for idx, row in enumerate(rows, start=2):
        for col in config.required_columns:
            col_norm = _normalize_header_key(str(col))
            if col_norm == "country":
                # Backward compatibility:
                # older runtime configs may still require "country", while new inputs
                # provide county-only column (e.g. "County where Sole Proprietor is located").
                country_val = str(row.get("country", "")).strip()
                county_val = str(row.get("county", "")).strip()
                if country_val or county_val:
                    continue
            if str(row.get(col, "")).strip() == "":
                errors.append(f"Row {idx}: missing required column '{col}'")
    return errors


def build_batch(rows: List[Dict[str, Any]], source_file: str, batch_id: str) -> IngestBatch:
    normalized = []
    for row in rows:
        d = dict(row)
        extra = d.get("extra_json", "")
        if isinstance(extra, str) and extra.strip():
            try:
                d["extra_json"] = json.loads(extra)
            except json.JSONDecodeError:
                # Keep raw text for manual follow-up
                d["extra_json"] = {"raw": extra}
        normalized.append(d)
    return IngestBatch(batch_id=batch_id, source_file=source_file, rows=normalized)


def load_csv_rows(path: str | Path) -> List[Dict[str, Any]]:
    import csv

    src = Path(path)
    if not src.exists():
        raise ExcelIngestError(f"CSV file not found: {src}")

    with src.open("r", newline="", encoding="utf-8") as f:
        return _canonicalize_rows([_normalize_row(row) for row in csv.DictReader(f)])
