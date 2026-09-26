"""
Inspect a Jacksonville FL record PDF to see the address format issue.
"""
import sys, re
sys.path.insert(0, '.')

import pymupdf, csv
from pathlib import Path

# Find Jacksonville record from results.csv
results_csv = Path(r"F:\Herd\fox-auto\app\dist\IRS_Bot_Full_Package\data\bug-auto\outputs\results.csv")
jax_record = None

with open(results_csv, 'r', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        state = str(row.get('step6_state') or '').strip().upper()
        county = str(row.get('step6_county') or '').strip().upper()
        name = str(row.get('record_name') or '').strip()
        pdf = row.get('final_pdf_path') or row.get('pdf_path') or ''
        if state == 'FL' and pdf and Path(pdf).exists():
            print(f"Found FL record: {name} | county: {county} | pdf: {Path(pdf).name}")
            jax_record = pdf
            # Inspect this pdf
            doc = pymupdf.open(pdf)
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
            for bucket in sorted(lines_by_y.keys()):
                line_spans = sorted(lines_by_y[bucket], key=lambda s: s["bbox"][0])
                parts = [s.get("text", "") for s in line_spans]
                joined = " ".join(p.strip() for p in parts if p.strip())
                print(f"  y~{bucket}: {repr(joined)}")
            break

if not jax_record:
    print("No FL record with local PDF found, searching all...")
    count = 0
    with open(results_csv, 'r', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            pdf = row.get('final_pdf_path') or row.get('pdf_path') or ''
            if pdf:
                p = Path(pdf)
                if not p.exists():
                    # Check relocated path
                    import re
                    m = re.search(r'\\bug-auto\\(.*)$', pdf, re.IGNORECASE)
                    if m:
                        rel = m.group(1)
                        alt = Path(r'F:\Herd\fox-auto\app\dist\IRS_Bot_Full_Package\data\bug-auto') / rel
                        if alt.exists():
                            pdf = str(alt)
                            p = alt
            if p.exists():
                count += 1
                if count > 3:
                    break
                state = str(row.get('step6_state') or '').strip().upper()
                print(f"  Local PDF found: {p.name} | state={state}")
