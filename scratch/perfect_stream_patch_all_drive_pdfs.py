#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
perfect_stream_patch_all_drive_pdfs.py
--------------------------------------
Chuyển đổi toàn bộ PDF thông báo trên Google Drive sang chuẩn Native Content Stream Patch.
Lấy bản gốc nguyên bản của IRS, sửa trực tiếp chuỗi text '(CITY, ST OLD_ZIP) Tj' thành
'(CITY, ST NEW_ZIP) Tj' trong luồng byte gốc:
1. Tuyệt đối không dùng insert_text chèn vào đuôi file.
2. Thứ tự đọc (reading order) giữ nguyên bản 100%.
3. Chuột bôi đen liền mạch 1 dải xanh, không nhảy xuống đoạn văn bên dưới.
4. Nhẹ đúng bằng byte gốc của IRS (~9.7 KB).
"""

import sys
import os
import re
import time
import requests
import pandas as pd
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, r'F:\Herd\fox-auto\scripts')
from drive_pdf_zip_updater import GoogleDriveSession, extract_file_id_from_url
import pymupdf

sys.stdout.reconfigure(encoding='utf-8')

client_json = r'F:\Herd\fox-auto\private\google-drive\oauth-web-client.json'
user_json = r'F:\Herd\fox-auto\private\google-drive\oauth-user.json'

drive_session = GoogleDriveSession(client_json, user_json)

def process_file_stream(item):
    file_id = item['file_id']
    old_zip = str(item['old_zip']).strip()
    new_zip = str(item['new_zip']).strip()
    
    if not file_id or not new_zip:
        return False, "Thiếu file_id hoặc new_zip"
        
    try:
        # Download revision 1 (original IRS PDF before any previous attempts)
        url_rev = f"https://www.googleapis.com/drive/v3/files/{file_id}/revisions"
        headers = {"Authorization": f"Bearer {drive_session.access_token}"}
        resp = requests.get(url_rev, headers=headers).json()
        revs = resp.get("revisions", [])
        
        orig_bytes = None
        if revs:
            first_rev_id = revs[0]["id"]
            url_dl = f"https://www.googleapis.com/drive/v3/files/{file_id}/revisions/{first_rev_id}?alt=media"
            r_dl = requests.get(url_dl, headers=headers)
            if r_dl.status_code == 200:
                orig_bytes = r_dl.content
                
        if not orig_bytes:
            orig_bytes = drive_session.download_file(file_id)
            
        doc = pymupdf.open(stream=orig_bytes, filetype='pdf')
        page = doc[0]
        
        changed = False
        for xref in page.get_contents():
            stream_bytes = doc.xref_stream(xref)
            text = stream_bytes.decode('latin1', errors='ignore')
            
            # Find any 5-digit ZIP pattern in address block string: e.g. '(CITY, ST 12345) Tj'
            # Look for line with city and zip
            if old_zip in text:
                pattern = re.compile(r'(\([^\)]*?)' + re.escape(old_zip) + r'([^\)]*\)\s*Tj)')
                new_text = pattern.sub(r'\g<1>' + new_zip + r'\g<2>', text)
                if new_text != text:
                    doc.update_stream(xref, new_text.encode('latin1'))
                    changed = True
            else:
                # If old_zip not found exactly, try matching (..., ST \d{5})
                m = re.search(r'(\([A-Za-z\s.-]+,\s*[A-Za-z]{2}\s+)\d{5}(\)\s*Tj)', text)
                if m:
                    new_text = text[:m.start()] + m.group(1) + new_zip + m.group(2) + text[m.end():]
                    doc.update_stream(xref, new_text.encode('latin1'))
                    changed = True
                    
        if changed:
            perfect_pdf = doc.tobytes()
            drive_session.upload_file_in_place(file_id, perfect_pdf)
            return True, "OK"
        else:
            return False, "Không tìm thấy chuỗi ZIP trong stream"
    except Exception as e:
        return False, str(e)

def run_perfect_patch(csv_path: Path, label: str):
    print("\n" + "=" * 75)
    print(f"BẮT ĐẦU CHUYỂN ĐỔI NATIVE STREAM CHO {label}")
    print("=" * 75)
    
    df = pd.read_csv(csv_path, dtype=str).fillna('')
    targets = []
    
    for idx, r in df.iterrows():
        pdf_url = str(r.get('PDF', '')).strip()
        fid = extract_file_id_from_url(pdf_url)
        if fid:
            targets.append({
                'name': r.get('NAME', ''),
                'file_id': fid,
                'old_zip': r.get('ZIP', ''), # will use regex fallback if needed
                'new_zip': r.get('ZIP', ''),
            })
            
    print(f"Tổng số file cần chuẩn hóa stream: {len(targets)}")
    
    success = 0
    fail = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(process_file_stream, t): t for t in targets}
        done_cnt = 0
        for fut in as_completed(futures):
            done_cnt += 1
            ok, msg = fut.result()
            if ok:
                success += 1
            else:
                fail += 1
            if done_cnt % 100 == 0 or done_cnt == len(targets):
                print(f"  Tiến độ {label}: {done_cnt}/{len(targets)} (Thành công: {success}, Bỏ qua/Lỗi: {fail})")
                
    print(f"XONG {label}: Chuẩn hóa hoàn hảo {success}/{len(targets)} PDF!")

if __name__ == '__main__':
    csv_125 = Path(r"F:\Herd\fox-auto\outputs\drive_cleaned_v2\25-09-2026_-_125_DONE\25-09-2026 - 125 DONE_CLEANED.csv")
    csv_1271 = Path(r"F:\Herd\fox-auto\outputs\drive_cleaned_v2\26-09-2026_-_1271_DONE\26-09-2026 - 1271 DONE_CLEANED.csv")
    
    run_perfect_patch(csv_125, "LÔ 125")
    run_perfect_patch(csv_1271, "LÔ 1271")
