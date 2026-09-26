#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
reclean_and_reupload_drive_batches.py
-------------------------------------
Chuẩn hóa 100% bằng US Census Bureau Geocoder cho:
1. Lô 125 (folder: 1aWOV3e4hRcy4mqaA8eBc74I1LzzGQx90)
2. Lô 1271 (folder: 1qoJULaMQt2auufsODYq9P4-hWSoPNwoi)

Thực hiện:
- Đối chiếu số nhà, tên đường phố từng record qua US Census Bureau.
- Với mọi record có ZIP khác chuẩn Census:
  + Tải PDF từ Google Drive
  + Sửa mã ZIP chuẩn trong khối địa chỉ (giữ nguyên mã vạch PDF417)
  + Re-upload đè trực tiếp lên Google Drive
- Đồng bộ lại toàn bộ file CSV và Excel trên Google Drive.
"""

import sys
import os
import re
import json
import time
import requests
import pandas as pd
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, r'F:\Herd\fox-auto\scripts')
from drive_pdf_zip_updater import GoogleDriveSession, extract_file_id_from_url, fix_pdf_zip

sys.stdout.reconfigure(encoding='utf-8')

client_json = r'F:\Herd\fox-auto\private\google-drive\oauth-web-client.json'
user_json = r'F:\Herd\fox-auto\private\google-drive\oauth-user.json'

drive_session = GoogleDriveSession(client_json, user_json)

def clean_street(addr: str) -> str:
    s = str(addr or '').strip()
    s = re.sub(r'\s+(?:APT|UNIT|STE|SUITE|BLDG|LOT|#|FL|RM|ROOM)\s*.*$', '', s, flags=re.IGNORECASE)
    return s.strip()

def geocode_census_chunk(chunk_records):
    lines = []
    for idx, r in enumerate(chunk_records):
        street = clean_street(r.get('ADDRESS', ''))
        city = str(r.get('CITI', '')).strip()
        state = str(r.get('BANG', '')).strip()
        lines.append(f"{idx},{street},{city},{state},")
    csv_bytes = ("\n".join(lines) + "\n").encode('utf-8')
    files = {'addressFile': ('chunk.csv', csv_bytes, 'text/csv')}
    data = {'benchmark': 'Public_AR_Current'}
    
    matches = {}
    try:
        resp = requests.post(
            'https://geocoding.geo.census.gov/geocoder/locations/addressbatch',
            files=files,
            data=data,
            timeout=120
        )
        if resp.status_code == 200:
            for line in resp.text.strip().split('\n'):
                if not line.strip(): continue
                parts = [p.strip().strip('"') for p in line.split('","')]
                if len(parts) >= 5 and parts[2].strip('"') == "Match":
                    row_idx = int(parts[0].strip('"'))
                    matched_addr = parts[4].strip('"')
                    m = re.search(r',\s*([A-Za-z\s.-]+),\s*([A-Za-z]{2})\s*,\s*(\d{5})$', matched_addr)
                    if m:
                        matches[row_idx] = m.group(3).strip()
    except Exception as e:
        print(f"  Lỗi geocode chunk: {e}")
    return matches

def process_drive_batch(folder_path: Path, label: str):
    print("\n" + "=" * 75)
    print(f"BẮT ĐẦU XỬ LÝ TRIỆT ĐỂ: {label} ({folder_path.name})")
    print("=" * 75)
    
    clean_csv_files = list(folder_path.glob("*_CLEANED.csv"))
    if not clean_csv_files:
        print(f"Không tìm thấy file CLEANED trong {folder_path}")
        return
        
    csv_file = clean_csv_files[0]
    df = pd.read_csv(csv_file, dtype=str).fillna('')
    total_records = len(df)
    print(f"Tổng số hồ sơ trong lô: {total_records}")
    
    # 1. Geocode through Census Bureau in chunks of 500
    records = df.to_dict('records')
    census_zip_map = {}
    chunk_size = 500
    for i in range(0, total_records, chunk_size):
        chunk = records[i:i+chunk_size]
        print(f"  Geocoding Census {i+1} đến {min(i+chunk_size, total_records)}...")
        chunk_res = geocode_census_chunk(chunk)
        for sub_idx, z in chunk_res.items():
            census_zip_map[i + sub_idx] = z
            
    print(f"  -> Census khớp: {len(census_zip_map)}/{total_records} ({len(census_zip_map)/total_records*100:.1f}%)")
    
    # 2. Identify records needing PDF update
    to_update = []
    for idx in range(total_records):
        r = records[idx]
        current_zip = str(r.get('ZIP', '')).strip().zfill(5)
        new_zip = census_zip_map.get(idx)
        if new_zip and new_zip != current_zip:
            pdf_url = str(r.get('PDF', '')).strip()
            file_id = extract_file_id_from_url(pdf_url)
            to_update.append({
                'idx': idx,
                'name': r.get('NAME', ''),
                'address': r.get('ADDRESS', ''),
                'city': r.get('CITI', ''),
                'state': r.get('BANG', ''),
                'old_zip': current_zip,
                'new_zip': new_zip,
                'file_id': file_id,
                'pdf_url': pdf_url
            })
            # Update DataFrame
            df.at[idx, 'ZIP'] = new_zip
            
    print(f"Số lượng record phát hiện lệch ZIP cần sửa và re-upload PDF: {len(to_update)}")
    for item in to_update[:10]:
        print(f"  {item['name']}: {item['address']}, {item['city']}, {item['state']} | {item['old_zip']} -> {item['new_zip']}")
        
    # 3. Process PDFs and re-upload in parallel
    clean_dir = folder_path / "PDF_CLEANED"
    clean_dir.mkdir(exist_ok=True)
    
    success_count = 0
    fail_count = 0
    
    def update_single_pdf(item):
        file_id = item['file_id']
        old_zip = item['old_zip']
        new_zip = item['new_zip']
        if not file_id:
            return False, "Thiếu file_id"
        try:
            pdf_bytes = drive_session.download_file(file_id)
            updated_bytes, changed = fix_pdf_zip(pdf_bytes, old_zip, new_zip)
            if not changed:
                # If old zip wasn't found (maybe already changed or format issue), try finding any 5 digit zip in address block
                import pymupdf
                doc = pymupdf.open(stream=pdf_bytes, filetype='pdf')
                page = doc[0]
                text = page.get_text()
                # find zip in text
                m = re.search(r'\b(\d{5})\b', text[text.find('Notice'):text.find('Notice')+500] if 'Notice' in text else text)
                if m:
                    actual_old = m.group(1)
                    updated_bytes, changed = fix_pdf_zip(pdf_bytes, actual_old, new_zip)
            if changed:
                # Save locally
                clean_file = clean_dir / f"{item['name']}.pdf"
                with clean_file.open('wb') as fp:
                    fp.write(updated_bytes)
                # Re-upload to Drive in-place
                drive_session.upload_file_in_place(file_id, updated_bytes)
                return True, "OK"
            else:
                return False, "Không tìm thấy text ZIP trong block"
        except Exception as e:
            return False, str(e)
            
    print(f"\nBắt đầu tải PDF, sửa mã ZIP và re-upload đè lên Google Drive...")
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(update_single_pdf, item): item for item in to_update}
        completed_count = 0
        for fut in as_completed(futures):
            item = futures[fut]
            completed_count += 1
            ok, msg = fut.result()
            if ok:
                success_count += 1
            else:
                fail_count += 1
                print(f"  [LỖI] {item['name']}: {msg}")
            if completed_count % 50 == 0 or completed_count == len(to_update):
                print(f"  Tiến độ: {completed_count}/{len(to_update)} (Thành công: {success_count}, Thất bại: {fail_count})")
                
    # 4. Save updated CSV and Excel
    df.to_csv(csv_file, index=False, encoding='utf-8')
    xlsx_file = folder_path / (csv_file.stem + '.xlsx')
    df.to_excel(xlsx_file, index=False)
    print(f"Đã lưu file CSV & Excel cập nhật: {csv_file.name}")
    
    print(f"HOÀN THÀNH {label}: Sửa và re-upload thành công {success_count}/{len(to_update)} PDF!")

if __name__ == '__main__':
    dir_125 = Path(r"F:\Herd\fox-auto\outputs\drive_cleaned_v2\25-09-2026_-_125_DONE")
    dir_1271 = Path(r"F:\Herd\fox-auto\outputs\drive_cleaned_v2\26-09-2026_-_1271_DONE")
    
    # Process Lô 125
    process_drive_batch(dir_125, "LÔ 125")
    
    # Process Lô 1271
    process_drive_batch(dir_1271, "LÔ 1271")
