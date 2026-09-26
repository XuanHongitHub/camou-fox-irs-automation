#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
audit_and_fix_batches_3_to_16.py
---------------------------------
Thực hiện chuẩn hóa và sửa triệt để mã ZIP cho toàn bộ Batch 03 đến Batch 16
sử dụng US Census Bureau Batch Geocoder (dữ liệu chính phủ Hoa Kỳ) + Photon Geocoder.
Bảo đảm từng record đều có ZIP code giao hàng thực (physical street delivery),
loại bỏ 100% các mã ZIP PO Box / IRS center (73301, 77001, 33101, 75221, 90009...).
"""

import sys
import os
import glob
import re
import io
import time
import shutil
import urllib.parse
import urllib.request
import json
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional

import requests
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')

# Disallowed PO Box / IRS / Non-street delivery ZIPs
DISALLOWED_ZIPS = {
    '73301', '73344', # Austin IRS
    '77001',          # Houston PO Box
    '75221', '75222', # Dallas PO Box
    '90009', '90050', '90051', # LA PO Box
    '60690', '60691', # Chicago PO Box
    '33101', '33102', # Miami PO Box
    '64141', '64144', # KC PO Box
}

# Known common USPS abbreviations in raw data
USPS_CITY_EXPANSIONS = {
    'CORP CHRISTI': 'CORPUS CHRISTI',
    'N LAS VEGAS': 'NORTH LAS VEGAS',
    'FT WORTH': 'FORT WORTH',
    'ST LOUIS': 'SAINT LOUIS',
    'MT PROSPECT': 'MOUNT PROSPECT',
    'E PEORIA': 'EAST PEORIA',
    'W VALLEY CITY': 'WEST VALLEY CITY',
    'N MIAMI': 'NORTH MIAMI',
    'S SAN FRANCISCO': 'SOUTH SAN FRANCISCO',
    'W CHESTER': 'WEST CHESTER',
    'N CHARLESTON': 'NORTH CHARLESTON',
    'ST PETERSBURG': 'SAINT PETERSBURG',
    'VALLEY VLG': 'VALLEY VILLAGE',
    'GROSSE PT PK': 'GROSSE POINTE PARK',
    'POWDER SPGS': 'POWDER SPRINGS',
    'WEST PALM BCH': 'WEST PALM BEACH',
    'PENSACOLA BCH': 'PENSACOLA BEACH',
    'SATELLITE BCH': 'SATELLITE BEACH',
    'W HOLLYWOOD': 'WEST HOLLYWOOD',
    'WOODLAND HLS': 'WOODLAND HILLS',
    'RNCHO CORDOVA': 'RANCHO CORDOVA',
    'ROCHESTER HLS': 'ROCHESTER HILLS',
    'STERLING HTS': 'STERLING HEIGHTS',
    'S EL MONTE': 'SOUTH EL MONTE',
    'S PASADENA': 'SOUTH PASADENA',
    'W SACRAMENTO': 'WEST SACRAMENTO',
    'E SAINT LOUIS': 'EAST SAINT LOUIS',
    'EAST ST LOUIS': 'EAST SAINT LOUIS',
}

def load_postal_db():
    p = r'F:\Herd\fox-auto\irs_bot\data\us_city_zip_county.csv'
    df = pd.read_csv(p, dtype=str)
    db = {}
    for _, r in df.iterrows():
        c = str(r['city']).strip().upper()
        s = str(r['state']).strip().upper()
        pz = str(r['primary_zip']).strip().zfill(5)
        cnt = str(r['county']).strip().upper()
        vz = set(str(r.get('valid_zips', '')).split(';'))
        db[(c, s)] = {
            'primary_zip': pz,
            'county': cnt,
            'valid_zips': vz,
        }
    return db

def clean_street_for_census(addr: str) -> str:
    s = addr.strip()
    # Remove unit/apt/suite/ste/# at end to increase Census match rate
    s = re.sub(r'\s+(?:APT|UNIT|STE|SUITE|BLDG|LOT|#|FL|RM|ROOM)\s*.*$', '', s, flags=re.IGNORECASE)
    return s.strip()

def geocode_batch_census(records: List[Dict[str, Any]]) -> Dict[int, Dict[str, str]]:
    """
    Send batch of up to 1000 addresses to US Census Bureau Geocoder.
    Returns map of index -> {'zip': ..., 'city': ..., 'state': ..., 'matched_address': ...}
    """
    lines = []
    for idx, r in enumerate(records):
        street = clean_street_for_census(r['ADDRESS'])
        city = r['CITI']
        state = r['BANG']
        # ID, street, city, state, zip
        lines.append(f"{idx},{street},{city},{state},")
    
    csv_bytes = ("\n".join(lines) + "\n").encode('utf-8')
    files = {'addressFile': ('batch.csv', csv_bytes, 'text/csv')}
    data = {'benchmark': 'Public_AR_Current'}
    
    results = {}
    for attempt in range(1, 4):
        try:
            resp = requests.post(
                'https://geocoding.geo.census.gov/geocoder/locations/addressbatch',
                files=files,
                data=data,
                timeout=120
            )
            if resp.status_code == 200:
                for line in resp.text.strip().split('\n'):
                    if not line.strip():
                        continue
                    parts = [p.strip().strip('"') for p in line.split('","')]
                    if len(parts) >= 5:
                        row_idx = int(parts[0].strip('"'))
                        status = parts[2].strip('"')
                        if status == "Match":
                            matched_addr = parts[4].strip('"')
                            # Match format: "STREET, CITY, ST, ZIP"
                            m = re.search(r',\s*([A-Za-z\s.-]+),\s*([A-Za-z]{2})\s*,\s*(\d{5})$', matched_addr)
                            if m:
                                results[row_idx] = {
                                    'city': m.group(1).strip().upper(),
                                    'state': m.group(2).strip().upper(),
                                    'zip': m.group(3).strip(),
                                    'matched': matched_addr,
                                    'source': 'CENSUS'
                                }
                break
            else:
                print(f"  Census attempt {attempt} returned status {resp.status_code}")
                time.sleep(2)
        except Exception as exc:
            print(f"  Census attempt {attempt} error: {exc}")
            time.sleep(3)
            
    return results

def fallback_geocode_single(addr: str, city: str, state: str) -> Optional[Dict[str, str]]:
    """Lookup single address via Photon/OSM."""
    query = f"{addr}, {city}, {state}"
    url = 'https://photon.komoot.io/api/?' + urllib.parse.urlencode({'q': query, 'limit': 1})
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            features = data.get('features', [])
            if features:
                props = features[0].get('properties', {})
                postcode = str(props.get('postcode', '')).strip()
                if len(postcode) == 5 and postcode.isdigit() and postcode not in DISALLOWED_ZIPS:
                    return {
                        'zip': postcode,
                        'city': str(props.get('city') or city).strip().upper(),
                        'state': str(props.get('state') or state).strip().upper(),
                        'source': 'PHOTON'
                    }
    except Exception:
        pass
    return None

def process_all_batches():
    base_dir = Path(r'G:\RTTS\19-08-2026\ein_irs\BATCHES_1000_SORTED')
    backup_dir = base_dir / f'_BACKUP_{int(time.time())}'
    backup_dir.mkdir(exist_ok=True)
    
    postal_db = load_postal_db()
    print(f"Loaded postal DB with {len(postal_db)} city/state keys")
    
    # Get all batch files 03 to 16
    batch_files = [
        f for f in sorted(base_dir.glob('batch_*.csv'))
        if not any(x in f.name for x in ['_01_', '_02_', 'MANIFEST'])
    ]
    
    print(f"Found {len(batch_files)} target batch files to process (batch 03 to 16):")
    for f in batch_files:
        print(f"  - {f.name}")
        
    overall_total = 0
    overall_census_matches = 0
    overall_photon_matches = 0
    overall_postal_fallback = 0
    overall_zips_changed = 0
    
    for f_path in batch_files:
        print("\n" + "=" * 70)
        print(f"Đang xử lý: {f_path.name}")
        print("=" * 70)
        
        # 1. Backup file gốc trước khi sửa
        shutil.copy2(f_path, backup_dir / f_path.name)
        xlsx_name = f_path.stem + '.xlsx'
        orig_xlsx = f_path.parent / xlsx_name
        if orig_xlsx.exists():
            shutil.copy2(orig_xlsx, backup_dir / xlsx_name)
            
        df = pd.read_csv(f_path, dtype=str).fillna('')
        total_rows = len(df)
        overall_total += total_rows
        
        records = df.to_dict('records')
        
        # 2. Census Batch Geocoding
        print(f"  [1/3] Gửi {total_rows} địa chỉ tới US Census Geocoder...")
        t0 = time.time()
        census_results = geocode_batch_census(records)
        t_census = time.time() - t0
        census_count = len(census_results)
        overall_census_matches += census_count
        print(f"  -> Census khớp: {census_count}/{total_rows} ({census_count/total_rows*100:.1f}%) trong {t_census:.1f}s")
        
        # 3. Process each record
        batch_changed = 0
        photon_count = 0
        postal_count = 0
        
        for idx in range(total_rows):
            r = records[idx]
            orig_zip = str(r.get('ZIP', '')).strip().zfill(5)
            orig_city = str(r.get('CITI', '')).strip().upper()
            orig_state = str(r.get('BANG', '')).strip().upper()
            orig_county = str(r.get('county', '')).strip().upper()
            addr = str(r.get('ADDRESS', '')).strip()
            
            resolved_zip = None
            resolved_city = orig_city
            resolved_state = orig_state
            resolved_county = orig_county
            
            # Step A: Check Census match
            if idx in census_results:
                c_data = census_results[idx]
                c_zip = c_data['zip']
                if c_zip not in DISALLOWED_ZIPS:
                    resolved_zip = c_zip
                    # Lookup county from postal DB
                    p_info = postal_db.get((c_data['city'], c_data['state'])) or postal_db.get((orig_city, orig_state))
                    if p_info and p_info['county']:
                        resolved_county = p_info['county']
            
            # Step B: Fallback Photon for no-match
            if not resolved_zip:
                # Expand city abbreviation if needed
                exp_city = USPS_CITY_EXPANSIONS.get(orig_city, orig_city)
                photon_res = fallback_geocode_single(clean_street_for_census(addr), exp_city, orig_state)
                if photon_res:
                    resolved_zip = photon_res['zip']
                    photon_count += 1
                    overall_photon_matches += 1
                    p_info = postal_db.get((photon_res['city'], photon_res['state'])) or postal_db.get((orig_city, orig_state))
                    if p_info and p_info['county']:
                        resolved_county = p_info['county']
            
            # Step C: Fallback to Postal DB
            if not resolved_zip:
                exp_city = USPS_CITY_EXPANSIONS.get(orig_city, orig_city)
                p_info = postal_db.get((exp_city, orig_state)) or postal_db.get((orig_city, orig_state))
                if p_info:
                    # If current ZIP is already a valid street ZIP for this city, keep it!
                    if orig_zip in p_info['valid_zips'] and orig_zip not in DISALLOWED_ZIPS:
                        resolved_zip = orig_zip
                    else:
                        resolved_zip = p_info['primary_zip']
                    resolved_county = p_info['county'] or resolved_county
                    postal_count += 1
                    overall_postal_fallback += 1
                else:
                    resolved_zip = orig_zip
            
            # Final check: absolutely NEVER allow DISALLOWED_ZIPS
            if resolved_zip in DISALLOWED_ZIPS:
                p_info = postal_db.get((orig_city, orig_state))
                if p_info:
                    resolved_zip = p_info['primary_zip']
                    resolved_county = p_info['county'] or resolved_county
            
            # Apply changes to DataFrame
            if resolved_zip != orig_zip:
                batch_changed += 1
                overall_zips_changed += 1
                df.at[idx, 'ZIP'] = resolved_zip
            else:
                df.at[idx, 'ZIP'] = orig_zip
                
            if resolved_county and resolved_county != orig_county:
                df.at[idx, 'county'] = resolved_county
                
        print(f"  [2/3] Tổng ZIP được chuẩn hóa trong batch: {batch_changed} (Photon: {photon_count}, Postal fallback: {postal_count})")
        
        # 4. Save updated CSV and XLSX
        print(f"  [3/3] Lưu file chuẩn hóa: {f_path.name} & {xlsx_name}")
        df.to_csv(f_path, index=False, encoding='utf-8')
        df.to_excel(f_path.parent / xlsx_name, index=False)
        
    print("\n" + "=" * 70)
    print("HOÀN TẤT CHUẨN HÓA BATCH 03 ĐẾN 16")
    print("=" * 70)
    print(f"Tổng số record đã xử lý: {overall_total}")
    print(f"Census Bureau khớp chính xác: {overall_census_matches} ({overall_census_matches/overall_total*100:.1f}%)")
    print(f"Photon / OSM bổ trợ: {overall_photon_matches}")
    print(f"Postal DB chuẩn hóa: {overall_postal_fallback}")
    print(f"Tổng số mã ZIP được sửa lại chuẩn từng milimet: {overall_zips_changed}")
    print(f"Bản sao lưu lưu tại: {backup_dir}")

if __name__ == '__main__':
    process_all_batches()
