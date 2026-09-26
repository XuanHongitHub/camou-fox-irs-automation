#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
drive_pdf_zip_updater.py
------------------------
Công cụ tự động:
1. Quét các record có mã ZIP được sửa từ Máy Lọc V2.
2. Tải file PDF thông báo thuế IRS (CP 575 / 147C) tương ứng từ Google Drive.
3. Sao lưu (backup) file PDF gốc.
4. Chỉnh sửa mã ZIP trong khối địa chỉ của file PDF chuẩn từng pixel (font Helvetica 9pt, căn chỉnh tọa độ).
   LƯU Ý QUAN TRỌNG: Mã vạch PDF417 ở góc trên bên phải (chứa SSN, Name Control, Form ID) được bảo toàn 100%, không bị tác động.
5. Re-upload ghi đè trực tiếp lên Google Drive (giữ nguyên File ID và link chia sẻ).
6. Đồng bộ lại file Excel tổng.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
import time

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import pymupdf
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("drive_pdf_updater")


class GoogleDriveSession:
    def __init__(self, client_json: str, user_json: str):
        self.client_json = client_json
        self.user_json = user_json
        self.access_token = ""
        self.token_expiry = 0.0
        self._ensure_token()

    def _ensure_token(self):
        if time.time() < self.token_expiry - 60 and self.access_token:
            return
        client = json.load(open(self.client_json, "r", encoding="utf-8"))
        user = json.load(open(self.user_json, "r", encoding="utf-8"))
        body = {
            "client_id": client["web"]["client_id"],
            "client_secret": client["web"]["client_secret"],
            "refresh_token": user["refresh_token"],
            "grant_type": "refresh_token",
        }
        resp = requests.post("https://oauth2.googleapis.com/token", data=body, timeout=30)
        data = resp.json()
        if resp.status_code != 200 or not data.get("access_token"):
            raise RuntimeError(f"Failed to refresh OAuth token: {data}")
        self.access_token = data["access_token"]
        expires_in = data.get("expires_in", 3500)
        self.token_expiry = time.time() + expires_in

    def headers(self) -> Dict[str, str]:
        self._ensure_token()
        return {"Authorization": f"Bearer {self.access_token}"}

    def download_file(self, file_id: str) -> bytes:
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
        resp = requests.get(url, headers=self.headers(), params={"alt": "media", "supportsAllDrives": "true"}, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"Failed to download file {file_id}: HTTP {resp.status_code}")
        return resp.content

    def upload_file_in_place(self, file_id: str, content: bytes, mime_type: str = "application/pdf"):
        url = f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media&supportsAllDrives=true"
        hdrs = self.headers()
        hdrs["Content-Type"] = mime_type
        resp = requests.patch(url, headers=hdrs, data=content, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"Failed to update file {file_id}: HTTP {resp.status_code} - {resp.text}")


def fix_pdf_zip(pdf_bytes: bytes, old_zip: str, new_zip: str) -> Tuple[bytes, bool]:
    """
    Sửa mã ZIP trong khối địa chỉ của file PDF thông báo IRS.
    Bảo toàn 100% mã vạch PDF417 ở góc trên bên phải (y < 70).
    """
    raw_old = re.sub(r"\D", "", str(old_zip or "")).strip()
    raw_new = re.sub(r"\D", "", str(new_zip or "")).strip().zfill(5)

    if not raw_old or not raw_new or raw_old == raw_new:
        return pdf_bytes, False

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]

    # Địa chỉ của IRS CP 575 nằm trong khoảng y: 140..220
    spans = [s for b in page.get_text("dict")["blocks"] if b.get("type") == 0 for l in b["lines"] for s in l["spans"]]
    target_span = None
    for s in spans:
        if raw_old in s["text"] and 140 < s["bbox"][1] < 220:
            target_span = s
            break

    rects = page.search_for(raw_old)
    matching_rects = [r for r in rects if 140 < r.y0 < 220]
    if not matching_rects:
        # Thử tìm ZIP 4 số (nếu bị cắt 0)
        if len(raw_old) == 5 and raw_old.startswith("0"):
            short_old = raw_old[1:]
            rects = page.search_for(short_old)
            matching_rects = [r for r in rects if 140 < r.y0 < 220]

    if not matching_rects:
        return pdf_bytes, False

    rect = matching_rects[0]
    baseline_y = target_span["origin"][1] if target_span else (rect.y1 - 2.5)
    font_size = target_span["size"] if target_span else 9.0

    # Vùng che phủ an toàn: cộng thêm 2.2pt vào y0 để không chạm vào dòng tên đường phía trên
    safe_rect = pymupdf.Rect(rect.x0, rect.y0 + 2.2, rect.x1, rect.y1)
    page.add_redact_annot(safe_rect, fill=(1, 1, 1))
    page.apply_redactions()

    # Chèn mã ZIP mới bằng đúng font Helvetica kích thước 9pt
    page.insert_text(pymupdf.Point(rect.x0, baseline_y), raw_new, fontname="helv", fontsize=font_size, color=(0, 0, 0))

    return doc.tobytes(), True


def extract_file_id_from_url(url: str) -> str:
    m = re.search(r"file/d/([A-Za-z0-9_-]+)", url)
    if m:
        return m.group(1)
    m2 = re.search(r"id=([A-Za-z0-9_-]+)", url)
    if m2:
        return m2.group(1)
    return ""


def process_single_pdf(
    item: Dict[str, Any],
    drive_session: GoogleDriveSession,
    backup_dir: Path,
    clean_dir: Path,
    dry_run: bool = False,
) -> Dict[str, Any]:
    file_id = item["file_id"]
    name = item["name"]
    old_zip = item["old_zip"]
    new_zip = item["new_zip"]
    person = item["person"]

    res = {
        "file_id": file_id,
        "name": name,
        "person": person,
        "old_zip": old_zip,
        "new_zip": new_zip,
        "success": False,
        "error": None,
    }

    try:
        # 1. Tải PDF từ Drive
        pdf_bytes = drive_session.download_file(file_id)

        # 2. Lưu bản sao lưu gốc (Local Backup)
        backup_file = backup_dir / name
        if not backup_file.exists():
            with backup_file.open("wb") as fp:
                fp.write(pdf_bytes)

        # 3. Sửa mã ZIP chuẩn
        updated_bytes, changed = fix_pdf_zip(pdf_bytes, old_zip, new_zip)
        if not changed:
            res["error"] = "ZIP string not found in address block"
            return res

        # 4. Lưu bản đã sửa tại local
        clean_file = clean_dir / name
        with clean_file.open("wb") as fp:
            fp.write(updated_bytes)

        # 5. Re-upload lên Google Drive (ghi đè in-place)
        if not dry_run:
            drive_session.upload_file_in_place(file_id, updated_bytes)

        res["success"] = True
    except Exception as exc:
        res["error"] = str(exc)

    return res


def process_folder_pdfs(
    folder_name: str,
    orig_csv_path: Path,
    clean_csv_path: Path,
    drive_session: GoogleDriveSession,
    base_out_dir: Path,
    max_workers: int = 8,
    dry_run: bool = False,
):
    logger.info("=" * 70)
    logger.info("Bắt đầu xử lý PDF cho thư mục: '%s'", folder_name)
    logger.info("=" * 70)

    if not orig_csv_path.exists() or not clean_csv_path.exists():
        logger.error("Không tìm thấy file đối chiếu: %s hoặc %s", orig_csv_path, clean_csv_path)
        return

    orig_df = pd.read_csv(orig_csv_path, dtype=str).fillna("")
    clean_df = pd.read_csv(clean_csv_path, dtype=str).fillna("")

    # Xác định danh sách các record có ZIP bị thay đổi
    targets: List[Dict[str, Any]] = []
    for idx in range(min(len(orig_df), len(clean_df))):
        o_row = orig_df.iloc[idx]
        c_row = clean_df.iloc[idx]

        o_zip = str(o_row.get("ZIP", "")).strip()
        c_zip = str(c_row.get("ZIP", "")).strip()

        if o_zip != c_zip and c_zip:
            pdf_url = str(c_row.get("PDF", "")).strip()
            file_id = extract_file_id_from_url(pdf_url)
            person = str(c_row.get("NAME", "")).strip()
            ein = str(c_row.get("EIN", "")).strip()
            ssn = str(c_row.get("SSN", "")).strip()

            if file_id:
                # Tên file PDF chuẩn
                file_name = f"{person} - {ein} - {ssn}.pdf".replace("/", "-")
                targets.append({
                    "file_id": file_id,
                    "name": file_name,
                    "person": person,
                    "old_zip": o_zip,
                    "new_zip": c_zip,
                    "city": str(c_row.get("CITI", "")),
                    "state": str(c_row.get("BANG", "")),
                })

    logger.info("Tìm thấy %d file PDF cần sửa mã ZIP trên Drive.", len(targets))
    if not targets:
        return

    folder_dir = base_out_dir / folder_name.replace(" ", "_")
    backup_dir = folder_dir / "PDF_BACKUP"
    clean_dir = folder_dir / "PDF_CLEANED"
    backup_dir.mkdir(parents=True, exist_ok=True)
    clean_dir.mkdir(parents=True, exist_ok=True)

    success_count = 0
    fail_count = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_single_pdf, item, drive_session, backup_dir, clean_dir, dry_run): item
            for item in targets
        }

        for idx, fut in enumerate(as_completed(futures), start=1):
            res = fut.result()
            if res["success"]:
                success_count += 1
                logger.info(
                    "[%d/%d] [OK] %s (%s, %s): %s -> %s | Re-uploaded Drive (ID: %s)",
                    idx,
                    len(targets),
                    res["person"],
                    futures[fut]["city"],
                    futures[fut]["state"],
                    res["old_zip"],
                    res["new_zip"],
                    res["file_id"],
                )
            else:
                fail_count += 1
                logger.warning(
                    "[%d/%d] [FAIL] %s: %s",
                    idx,
                    len(targets),
                    res["person"],
                    res["error"],
                )

    elapsed = time.time() - start_time
    logger.info("-" * 50)
    logger.info("KẾT QUẢ XỬ LÝ PDF '%s':", folder_name)
    logger.info("  * Tổng số file cần sửa : %d", len(targets))
    logger.info("  * Sửa & Re-upload OK   : %d (%.1f%%)", success_count, success_count / len(targets) * 100)
    logger.info("  * Lỗi / Bỏ qua         : %d", fail_count)
    logger.info("  * Thời gian hoàn thành : %.1f giây", elapsed)
    logger.info("  * Thư mục backup PDF   : %s", backup_dir)
    logger.info("  * Thư mục PDF đã sửa   : %s", clean_dir)
    logger.info("-" * 50)


def main():
    parser = argparse.ArgumentParser(description="Cập nhật mã ZIP cho file PDF và re-upload Google Drive")
    parser.add_argument("--dry-run", action="store_true", help="Chạy thử nghiệm không upload lên Drive")
    parser.add_argument("--workers", type=int, default=8, help="Số luồng tải và upload đồng thời")
    parser.add_argument(
        "--base-dir",
        default=r"F:\Herd\fox-auto\outputs\drive_cleaned_v2",
        help="Thư mục chứa dữ liệu local",
    )
    args = parser.parse_args()

    client_json = r"F:\Herd\fox-auto\private\google-drive\oauth-web-client.json"
    user_json = r"F:\Herd\fox-auto\private\google-drive\oauth-user.json"

    drive_session = GoogleDriveSession(client_json, user_json)
    base_dir = Path(args.base_dir)

    tasks = [
        {
            "name": "26-09-2026 - 1271 DONE",
            "orig": base_dir / "26-09-2026_-_1271_DONE" / "26-09-2026 - 1271 DONE_ORIGINAL.csv",
            "clean": base_dir / "26-09-2026_-_1271_DONE" / "26-09-2026 - 1271 DONE_CLEANED.csv",
        },
        {
            "name": "25-09-2026 - 125 DONE",
            "orig": base_dir / "25-09-2026_-_125_DONE" / "25-09-2026 - 125 DONE_ORIGINAL.csv",
            "clean": base_dir / "25-09-2026_-_125_DONE" / "25-09-2026 - 125 DONE_CLEANED.csv",
        },
    ]

    for t in tasks:
        process_folder_pdfs(
            t["name"],
            t["orig"],
            t["clean"],
            drive_session,
            base_dir,
            max_workers=args.workers,
            dry_run=args.dry_run,
        )


if __name__ == "__main__":
    main()
