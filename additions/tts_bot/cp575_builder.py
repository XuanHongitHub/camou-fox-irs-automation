# -*- coding: utf-8 -*-
"""
Official IRS Notice CP575G (EIN Confirmation Letter) Generator
Vector-sharp PyMuPDF Redaction & Clean Typography Overlay
"""

import os
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional
import pymupdf

POSSIBLE_TEMPLATES = [
    Path(r"F:\Herd\fox-auto\templates\CP575.pdf"),
    Path(r"G:\RTTS\dotpsd\templates\CP575.pdf"),
    Path(r"G:\RTTS\19-08-2026\templates\CP575.pdf"),
    Path(r"G:\RTTS\19-08-2026\ein_irs\_OLD_ARCHIVE_NO_TOUCH\ein_irs_master\PDFs\15-04-2026 - 71 DONE-20260819T025416Z-1-001\Albert Yu - 42-1927237 - 216177698.pdf")
]

class CP575Builder:
    def __init__(self, template_path: Optional[Path] = None):
        if template_path and Path(template_path).exists():
            self.template_path = Path(template_path)
        else:
            found = None
            for p in POSSIBLE_TEMPLATES:
                if p.exists():
                    found = p
                    break
            if not found:
                raise FileNotFoundError("IRS CP575 template PDF not found.")
            self.template_path = found

    def build(self, profile: Dict[str, Any], output_dir: Path, notice_date: Optional[str] = None) -> Path:
        """
        Generates an authentic IRS CP575G Notice PDF for proof of EIN.
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        full_name = str(profile.get("fullName") or profile.get("full_name") or "JOHN DOE").strip().upper()
        biz_name = str(profile.get("businessName") or profile.get("nameLlc") or profile.get("business_name") or full_name).strip().upper()
        addr = str(profile.get("address") or "123 MAIN ST").strip().upper()
        city = str(profile.get("city") or "SPRINGFIELD").strip().upper()
        state = str(profile.get("state") or "CA").strip().upper()
        zip_code = str(profile.get("zipCode") or profile.get("zip") or "90210").strip()

        # Format EIN as XX-XXXXXXX
        raw_ein = re.sub(r"\D", "", str(profile.get("ein") or "421927237"))
        if len(raw_ein) == 9:
            ein_formatted = f"{raw_ein[:2]}-{raw_ein[2:]}"
        else:
            ein_formatted = profile.get("ein") or "42-1927237"

        # SSN clean for filename
        raw_ssn = re.sub(r"\D", "", str(profile.get("ssn") or ""))
        
        # Name control (first 4 uppercase letters of last name or entity)
        parts = [p for p in full_name.split() if p]
        last_word = parts[-1] if parts else "NAME"
        last_word_clean = re.sub(r"[^A-Z]", "", last_word)
        name_control = (last_word_clean[:4] if len(last_word_clean) >= 4 else last_word_clean).ljust(4)[:4]

        # Date formatting
        if notice_date:
            date_str = notice_date
        else:
            reg_date = profile.get("regDate") or profile.get("reg_date")
            if reg_date:
                try:
                    if "/" in str(reg_date):
                        dt = datetime.strptime(str(reg_date).strip(), "%m/%d/%Y")
                    elif "-" in str(reg_date):
                        dt = datetime.strptime(str(reg_date).strip()[:10], "%Y-%m-%d")
                    else:
                        dt = datetime.now()
                    date_str = dt.strftime("%B %d, %Y")
                except Exception:
                    date_str = datetime.now().strftime("%B %d, %Y")
            else:
                date_str = datetime.now().strftime("%B %d, %Y")

        # Filename standard: '[Full Name] - [EIN] - [SSN].pdf'
        if raw_ssn and len(raw_ssn) == 9:
            out_pdf_name = f"{full_name} - {ein_formatted} - {raw_ssn}.pdf"
        else:
            out_pdf_name = f"{full_name} - {ein_formatted} - CP575.pdf"

        target_pdf_path = output_dir / out_pdf_name

        doc = pymupdf.open(str(self.template_path))
        page = doc[0]

        # 1. Redact old fields
        page.add_redact_annot(pymupdf.Rect(324, 765, 450, 782), fill=(1, 1, 1))
        page.add_redact_annot(pymupdf.Rect(88, 145, 350, 195), fill=(1, 1, 1))
        page.add_redact_annot(pymupdf.Rect(450, 192, 578, 210), fill=(1, 1, 1))
        page.add_redact_annot(pymupdf.Rect(83.5, 268, 135, 283), fill=(1, 1, 1))
        page.add_redact_annot(pymupdf.Rect(316.0, 268, 350, 283), fill=(1, 1, 1))
        page.apply_redactions()

        font_name = "helv"
        BLACK = (0, 0, 0)

        # 2. Insert updated text
        page.insert_text(pymupdf.Point(325.2, 777), ein_formatted, fontname=font_name, fontsize=8.5, color=BLACK)

        line1 = full_name
        line2 = biz_name if biz_name != full_name else full_name
        line3 = addr
        line4 = f"{city}, {state} {zip_code}"

        page.insert_text(pymupdf.Point(89.9, 157.5), line1, fontname=font_name, fontsize=8.5, color=BLACK)
        page.insert_text(pymupdf.Point(89.9, 168.0), line2, fontname=font_name, fontsize=8.5, color=BLACK)
        page.insert_text(pymupdf.Point(89.9, 178.5), line3, fontname=font_name, fontsize=8.5, color=BLACK)
        page.insert_text(pymupdf.Point(89.9, 189.0), line4, fontname=font_name, fontsize=8.5, color=BLACK)

        page.insert_text(pymupdf.Point(510, 204), date_str, fontname=font_name, fontsize=8.5, color=BLACK)
        page.insert_text(pymupdf.Point(84.0, 279), ein_formatted, fontname=font_name, fontsize=8.5, color=BLACK)
        page.insert_text(pymupdf.Point(316.8, 279), name_control, fontname=font_name, fontsize=8.5, color=BLACK)

        doc.save(str(target_pdf_path))
        doc.close()

        return target_pdf_path
