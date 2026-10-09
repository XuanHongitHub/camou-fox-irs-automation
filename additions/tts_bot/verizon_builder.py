# -*- coding: utf-8 -*-
"""
Verizon Telecom / Proof of Address Statement Generator
Template: VERIZON.pdf (PyMuPDF Redaction & Overlay)
"""

import os
import re
import sys
import random
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import pymupdf

POSSIBLE_VERIZON_TEMPLATES = [
    Path(r"F:\Herd\fox-auto\templates\VERIZON.pdf"),
    Path(r"G:\RTTS\dotpsd\templates\VERIZON.pdf"),
    Path(r"G:\RTTS\19-08-2026\templates\VERIZON.pdf"),
    Path(r"G:\RTTS\19-08-2026\studio_app\backend\template\VERIZON.pdf")
]

FONT_CALIBRI = "C:/Windows/Fonts/calibri.ttf"
FONT_CALIBRIB = "C:/Windows/Fonts/calibrib.ttf"

class VerizonStatementBuilder:
    def __init__(self, template_path: Optional[Path] = None):
        if template_path and Path(template_path).exists():
            self.template_path = Path(template_path)
        else:
            found = None
            for p in POSSIBLE_VERIZON_TEMPLATES:
                if p.exists():
                    found = p
                    break
            if not found:
                raise FileNotFoundError("Verizon template PDF not found.")
            self.template_path = found

    def build(self, profile: Dict[str, Any], output_dir: Path, statement_num: Optional[str] = None) -> Path:
        """
        Builds the Verizon Bill Statement PDF for proof of address.
        Output name '[Full Name] - [Statement #] - Verizon.pdf'
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        full_name = str(profile.get("fullName") or profile.get("full_name") or "JOHN DOE").strip().upper()
        addr = str(profile.get("address") or "123 MAIN ST").strip().upper()
        city = str(profile.get("city") or "SPRINGFIELD").strip().upper()
        state = str(profile.get("state") or "CA").strip().upper()
        zip_code = str(profile.get("zipCode") or profile.get("zip") or "90210").strip()
        
        stmt_num = statement_num or profile.get("statement_num") or profile.get("statementNum") or profile.get("ein") or profile.get("ssn") or f"{random.randint(10, 99)}-{random.randint(1000000, 9999999)}"

        # Statement date
        stmt_date_str = profile.get("statement_date") or profile.get("statementDate")
        if stmt_date_str:
            try:
                stmt_dt = datetime.strptime(stmt_date_str, "%B %d, %Y")
            except Exception:
                stmt_dt = datetime.now() - timedelta(days=random.randint(15, 30))
        else:
            stmt_dt = datetime.now() - timedelta(days=random.randint(15, 30))

        phone_area = random.randint(200, 999)
        phone_mid = random.randint(200, 999)
        phone_end = random.randint(1000, 9999)
        phone_str = f"{phone_area} {phone_mid} {phone_end}"
        acct_12 = "".join([str(random.randint(0, 9)) for _ in range(12)])

        pay_dt = stmt_dt - timedelta(days=random.randint(10, 20))
        pay_month_str = pay_dt.strftime("%b") + " " + str(pay_dt.day)

        VERIZON_SERVICES = [
            "Fios TV Ultimate HD",
            "Fios Gigabit Connection",
            "Multi-Room DVR Service",
            "Fios Digital Voice",
            "Whole Home WiFi",
            "Business Internet 500/500",
            "Cloud Storage 2TB",
            "Static IP Address",
        ]
        selected_svc = random.choice(VERIZON_SERVICES)
        charge_amt = round(random.uniform(150.0, 320.0), 2)
        taxes_amt = round(charge_amt * random.uniform(0.07, 0.115), 2)
        total_new = round(charge_amt + taxes_amt, 2)
        prev_bal = round(random.uniform(150.0, 280.0), 2)

        def fmt(v, neg=False):
            s = f"${v:,.2f}"
            return f"-{s}" if neg else s

        out_pdf_name = f"{full_name} - {stmt_num} - Verizon.pdf"
        target_pdf_path = output_dir / out_pdf_name

        # Open template
        doc = pymupdf.open(str(self.template_path))
        page = doc[0]
        BLACK = (0.0, 0.0, 0.0)

        font_cal = FONT_CALIBRI if os.path.exists(FONT_CALIBRI) else None
        font_calb = FONT_CALIBRIB if os.path.exists(FONT_CALIBRIB) else None

        # Redact customer info block
        page.add_redact_annot(pymupdf.Rect(35, 110, 280, 215), fill=(1, 1, 1))
        # Redact account & summary numbers
        page.add_redact_annot(pymupdf.Rect(400, 110, 580, 155), fill=(1, 1, 1))
        page.add_redact_annot(pymupdf.Rect(400, 175, 580, 280), fill=(1, 1, 1))
        page.add_redact_annot(pymupdf.Rect(35, 295, 300, 340), fill=(1, 1, 1))
        page.apply_redactions()

        # Insert Customer Info
        y = 135
        page.insert_text(pymupdf.Point(40, y), full_name, fontfile=font_calb, fontsize=10.5, color=BLACK)
        y += 14
        page.insert_text(pymupdf.Point(40, y), addr, fontfile=font_cal, fontsize=9.5, color=BLACK)
        y += 13
        page.insert_text(pymupdf.Point(40, y), f"{city}, {state} {zip_code}", fontfile=font_cal, fontsize=9.5, color=BLACK)

        # Header Statement Details
        page.insert_text(pymupdf.Point(410, 125), f"Statement Date: {stmt_dt.strftime('%B %d, %Y')}", fontfile=font_cal, fontsize=9, color=BLACK)
        page.insert_text(pymupdf.Point(410, 138), f"Account Number: {acct_12[:4]} {acct_12[4:8]} {acct_12[8:]}", fontfile=font_cal, fontsize=9, color=BLACK)
        page.insert_text(pymupdf.Point(410, 151), f"Phone Number: {phone_str}", fontfile=font_cal, fontsize=9, color=BLACK)

        # Bill Summary Block
        sy = 190
        page.insert_text(pymupdf.Point(410, sy), "Previous Balance", fontfile=font_cal, fontsize=8.5, color=BLACK)
        page.insert_text(pymupdf.Point(530, sy), fmt(prev_bal), fontfile=font_cal, fontsize=8.5, color=BLACK)
        sy += 12
        page.insert_text(pymupdf.Point(410, sy), f"Payment - Thank you ({pay_month_str})", fontfile=font_cal, fontsize=8.5, color=BLACK)
        page.insert_text(pymupdf.Point(530, sy), fmt(prev_bal, neg=True), fontfile=font_cal, fontsize=8.5, color=BLACK)
        sy += 12
        page.insert_text(pymupdf.Point(410, sy), selected_svc, fontfile=font_cal, fontsize=8.5, color=BLACK)
        page.insert_text(pymupdf.Point(530, sy), fmt(charge_amt), fontfile=font_cal, fontsize=8.5, color=BLACK)
        sy += 12
        page.insert_text(pymupdf.Point(410, sy), "Taxes, Governmental Surcharges & Fees", fontfile=font_cal, fontsize=8.5, color=BLACK)
        page.insert_text(pymupdf.Point(530, sy), fmt(taxes_amt), fontfile=font_cal, fontsize=8.5, color=BLACK)
        sy += 16
        page.insert_text(pymupdf.Point(410, sy), "Total Amount Due", fontfile=font_calb, fontsize=10, color=BLACK)
        page.insert_text(pymupdf.Point(525, sy), fmt(total_new), fontfile=font_calb, fontsize=10, color=BLACK)

        doc.save(str(target_pdf_path))
        doc.close()

        return target_pdf_path
