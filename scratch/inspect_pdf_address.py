"""
Inspect address blocks of IRS notice PDFs to understand the format issue.
"""
import sys, re
sys.path.insert(0, '.')

import pymupdf
from pathlib import Path

def inspect_pdf(pdf_path):
    doc = pymupdf.open(str(pdf_path))
    page = doc[0]
    dict_data = page.get_text("dict")
    spans = [
        s
        for b in dict_data.get("blocks", [])
        if b.get("type") == 0
        for l in b.get("lines", [])
        for s in l.get("spans", [])
    ]
    addr_spans = [s for s in spans if 130 < s["bbox"][1] < 240]
    lines_by_y = {}
    for s in addr_spans:
        bucket = int(round(s["bbox"][1] / 4.0)) * 4
        lines_by_y.setdefault(bucket, []).append(s)

    print(f"\n=== {pdf_path.name} ===")
    for bucket in sorted(lines_by_y.keys()):
        line_spans = sorted(lines_by_y[bucket], key=lambda s: s["bbox"][0])
        parts = [s.get("text", "") for s in line_spans]
        line_text = " | ".join(repr(p) for p in parts)
        joined = " ".join(p.strip() for p in parts if p.strip())
        print(f"  y~{bucket}: raw={line_text}")
        print(f"        joined={repr(joined)}")

# Find PDFs
artifacts_dir = Path(r"F:\Herd\fox-auto\app\dist\IRS_Bot_Full_Package\data\bug-auto\artifacts")
pdfs = list(artifacts_dir.rglob("*.pdf"))[:5]
for p in pdfs:
    try:
        inspect_pdf(p)
    except Exception as e:
        print(f"Error reading {p.name}: {e}")
