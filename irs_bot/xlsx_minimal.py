from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from xml.etree import ElementTree as ET
from zipfile import ZipFile


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg_rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


@dataclass
class SheetData:
    sheet_name: str
    rows: List[Dict[str, str]]


class XlsxParseError(RuntimeError):
    pass



def _col_to_index(cell_ref: str) -> int:
    letters = ""
    for ch in cell_ref:
        if ch.isalpha():
            letters += ch
        else:
            break
    if not letters:
        return 0

    out = 0
    for ch in letters.upper():
        out = out * 26 + (ord(ch) - ord("A") + 1)
    return out - 1



def _read_shared_strings(zf: ZipFile) -> List[str]:
    path = "xl/sharedStrings.xml"
    if path not in zf.namelist():
        return []

    xml = ET.fromstring(zf.read(path))
    out: List[str] = []
    for si in xml.findall("main:si", NS):
        # shared string can be split in runs
        parts = []
        for t in si.findall(".//main:t", NS):
            parts.append(t.text or "")
        out.append("".join(parts))
    return out



def _sheet_path(zf: ZipFile, sheet_name: Optional[str]) -> Tuple[str, str]:
    wb_xml = ET.fromstring(zf.read("xl/workbook.xml"))
    rel_xml = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))

    rel_map: Dict[str, str] = {}
    for rel in rel_xml.findall("pkg_rel:Relationship", NS):
        rid = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        if rid and target:
            rel_map[rid] = target

    sheets = wb_xml.findall("main:sheets/main:sheet", NS)
    if not sheets:
        raise XlsxParseError("Workbook has no sheets")

    chosen = None
    if sheet_name:
        for s in sheets:
            if s.attrib.get("name") == sheet_name:
                chosen = s
                break
    if chosen is None:
        chosen = sheets[0]

    rid = chosen.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    if not rid:
        raise XlsxParseError("Sheet missing relationship id")

    target = rel_map.get(rid)
    if not target:
        raise XlsxParseError(f"Relationship target not found for rid={rid}")

    normalized = target.lstrip("/")
    if not normalized.startswith("xl/"):
        normalized = f"xl/{normalized}"

    return normalized, chosen.attrib.get("name", "Sheet1")



def _cell_value(cell: ET.Element, shared: List[str]) -> str:
    t = cell.attrib.get("t", "")

    if t == "inlineStr":
        txt = cell.find("main:is/main:t", NS)
        return txt.text if txt is not None and txt.text is not None else ""

    v = cell.find("main:v", NS)
    if v is None or v.text is None:
        return ""

    if t == "s":
        try:
            idx = int(v.text)
            return shared[idx] if 0 <= idx < len(shared) else ""
        except Exception:
            return ""

    if t == "b":
        return "TRUE" if v.text == "1" else "FALSE"

    return v.text



def read_xlsx_rows(path: str | Path, sheet_name: Optional[str] = None) -> SheetData:
    src = Path(path)
    if not src.exists():
        raise XlsxParseError(f"File not found: {src}")

    with ZipFile(src) as zf:
        shared = _read_shared_strings(zf)
        sheet_xml_path, actual_sheet_name = _sheet_path(zf, sheet_name)
        if sheet_xml_path not in zf.namelist():
            raise XlsxParseError(f"Sheet xml not found: {sheet_xml_path}")

        xml = ET.fromstring(zf.read(sheet_xml_path))
        rows_xml = xml.findall("main:sheetData/main:row", NS)
        if not rows_xml:
            return SheetData(sheet_name=actual_sheet_name, rows=[])

        matrix: List[List[str]] = []
        max_col = 0
        for row in rows_xml:
            row_vals: Dict[int, str] = {}
            for cell in row.findall("main:c", NS):
                ref = cell.attrib.get("r", "")
                col_idx = _col_to_index(ref)
                max_col = max(max_col, col_idx)
                row_vals[col_idx] = _cell_value(cell, shared)

            dense = [""] * (max_col + 1)
            for idx, val in row_vals.items():
                if idx >= len(dense):
                    dense.extend([""] * (idx - len(dense) + 1))
                dense[idx] = val
            matrix.append(dense)

        if not matrix:
            return SheetData(sheet_name=actual_sheet_name, rows=[])

        header = [str(x).strip() for x in matrix[0]]
        while header and header[-1] == "":
            header.pop()

        records: List[Dict[str, str]] = []
        for row in matrix[1:]:
            row_out: Dict[str, str] = {}
            non_empty = False
            for idx, key in enumerate(header):
                if not key:
                    continue
                value = row[idx] if idx < len(row) else ""
                sval = str(value).strip()
                row_out[key] = sval
                if sval:
                    non_empty = True
            if non_empty:
                records.append(row_out)

        return SheetData(sheet_name=actual_sheet_name, rows=records)
