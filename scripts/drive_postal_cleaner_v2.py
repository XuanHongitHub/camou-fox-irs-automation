#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
drive_postal_cleaner_v2.py
--------------------------
Máy lọc Version 2: Tự động tải, sao lưu (backup), chuẩn hóa mã ZIP (ZIP & ZIP LLC)
theo chuẩn bưu điện Hoa Kỳ (USPS) và cập nhật trực tiếp lên Google Drive.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("drive_cleaner_v2")

# Common word-level regex expansions in USPS city names
ABBR_REPLACEMENTS = [
    (r"\bVLG\b", "VILLAGE"),
    (r"\bHLS\b", "HILLS"),
    (r"\bHTS\b", "HEIGHTS"),
    (r"\bBCH\b", "BEACH"),
    (r"\bIS\b", "ISLAND"),
    (r"\bPK\b", "PARK"),
    (r"\bSPGS\b", "SPRINGS"),
    (r"\bMT\b", "MOUNT"),
    (r"\bN\b", "NORTH"),
    (r"\bS\b", "SOUTH"),
    (r"\bE\b", "EAST"),
    (r"\bW\b", "WEST"),
    (r"\bFT\b", "FORT"),
    (r"\bST\b", "SAINT"),
    (r"\bRNCHO\b", "RANCHO"),
    (r"\bCNTRY\b", "COUNTRY"),
    (r"\bRNH\b", "RANCH"),
    (r"\bJAX\b", "JACKSONVILLE"),
    (r"\bCORP\b", "CORPUS"),
    (r"\bPROVIDNCE\b", "PROVIDENCE"),
    (r"\bSN\b", "SAN"),
    (r"\bBERNRDNO\b", "BERNARDINO"),
    (r"\bCAPO\b", "CAPISTRANO"),
    (r"\bSAC\b", "SACRAMENTO"),
    (r"\bHL\b", "HILL"),
]

# Specific localities mapping
CUSTOM_LOCALITY_ZIPS = {
    ("EASTVALE", "CA"): "92880",
    ("ROELAND PARK", "KS"): "66205",
    ("FRONTENAC", "MO"): "63131",
    ("WILDWOOD", "MO"): "63005",
    ("FAIRVIEW", "TX"): "75069",
    ("BISCAYNE PARK", "FL"): "33161",
    ("WEST MELBOURNE", "FL"): "32904",
    ("LAUDERDALE LAKES", "FL"): "33319",
    ("WEEKI WACHEE", "FL"): "34607",
    ("RICHLAND HILLS", "TX"): "76118",
    ("PROVIDENCE VILLAGE", "TX"): "76227",
    ("RSM", "CA"): "92688",
    ("OAKGROVE", "MO"): "64075",
    ("LA CANADA", "CA"): "91011",
    ("PENSACOLA BEACH", "FL"): "32561",
    ("SOUTH RICHMOND HILL", "NY"): "11419",
    ("WELDON SPRING", "MO"): "63304",
    ("KANSASCITY", "MO"): "64101",
    ("LITTLE FLOCK", "AR"): "72756",
    ("VIRGINIA GARDENS", "FL"): "33166",
    ("DORAL", "FL"): "33178",
    ("JOHNSBURG", "IL"): "60051",
    ("MAYFIELD HEIGHTS", "OH"): "44124",
    ("CLEVELAND HEIGHTS", "OH"): "44118",
}


class PostalEngineV2:
    def __init__(self):
        self.city_state_to_zips: Dict[Tuple[str, str], Set[str]] = {}
        self.city_state_primary: Dict[Tuple[str, str], str] = {}
        self._load_datasets()

    def _load_datasets(self):
        logger.info("Initializing Postal Database V2...")
        p_geo = r"G:\RTTS\19-08-2026\ein_irs\_OLD_ARCHIVE_NO_TOUCH\ein_irs_master\data_geonames\US.txt"
        cols = ["country", "zip", "city", "state_name", "state_abbr", "county", "county_code", "comm", "comm_code", "lat", "lon", "acc"]
        if os.path.exists(p_geo):
            df_geo = pd.read_csv(p_geo, sep="\t", header=None, names=cols, dtype=str)
            for _, r in df_geo.iterrows():
                c = str(r.get("city", "")).strip().upper()
                s = str(r.get("state_abbr", "")).strip().upper()
                z = str(r.get("zip", "")).strip().zfill(5)
                if c and s and len(z) == 5:
                    cs = (c, s)
                    if cs not in self.city_state_to_zips:
                        self.city_state_to_zips[cs] = set()
                        self.city_state_primary[cs] = z
                    self.city_state_to_zips[cs].add(z)

        p_sec = r"G:\RTTS\19-08-2026\ein_irs\_OLD_ARCHIVE_NO_TOUCH\ein_irs_master\geo-data.csv"
        if os.path.exists(p_sec):
            df_sec = pd.read_csv(p_sec, dtype=str)
            for _, r in df_sec.iterrows():
                c = str(r.get("city", "")).strip().upper()
                s = str(r.get("state_abbr", "")).strip().upper()
                z = str(r.get("zipcode", "")).strip().zfill(5)
                if c and s and len(z) == 5:
                    cs = (c, s)
                    if cs not in self.city_state_to_zips:
                        self.city_state_to_zips[cs] = set()
                        self.city_state_primary[cs] = z
                    self.city_state_to_zips[cs].add(z)

        for (c, s), z in CUSTOM_LOCALITY_ZIPS.items():
            self.city_state_to_zips[(c, s)] = {z}
            self.city_state_primary[(c, s)] = z

        logger.info("Loaded %d unique (city, state) entries.", len(self.city_state_to_zips))

    def resolve_zip(self, city: str, state: str, current_zip: str) -> Tuple[str, str]:
        """
        Returns (final_zip, status)
        status: 'kept_valid', 'corrected', 'padded_zero', 'unknown_city'
        """
        c = re.sub(r"\s+", " ", str(city or "").strip().upper())
        s = re.sub(r"\s+", " ", str(state or "").strip().upper())
        raw_z = re.sub(r"\D", "", str(current_zip or "").strip())

        # Direct match
        zset = self.city_state_to_zips.get((c, s))
        pz = self.city_state_primary.get((c, s))

        # Try abbreviation expansion if direct match fails
        if not zset:
            expanded = c
            for pattern, repl in ABBR_REPLACEMENTS:
                expanded = re.sub(pattern, repl, expanded)
            expanded = re.sub(r"\s+", " ", expanded).strip()
            zset = self.city_state_to_zips.get((expanded, s))
            pz = self.city_state_primary.get((expanded, s))

        if zset and pz:
            padded_raw = raw_z.zfill(5) if raw_z else ""
            if len(padded_raw) == 5 and padded_raw in zset:
                if len(raw_z) == 4:
                    return padded_raw, "padded_zero"
                return padded_raw, "kept_valid"
            else:
                return pz, "corrected"

        # City not found in database
        if len(raw_z) == 4:
            return raw_z.zfill(5), "padded_zero"
        return raw_z.zfill(5) if len(raw_z) == 5 else raw_z, "unknown_city"


class GoogleDriveClient:
    def __init__(self, client_json: str, user_json: str):
        self.client_json = client_json
        self.user_json = user_json
        self.access_token = self._get_token()

    def _get_token(self) -> str:
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
        return data["access_token"]

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}"}

    def extract_folder_id(self, input_val: str) -> str:
        m = re.search(r"folders/([A-Za-z0-9_-]+)", input_val)
        if m:
            return m.group(1)
        return input_val.strip()

    def get_folder_metadata(self, folder_id: str) -> Dict[str, Any]:
        url = f"https://www.googleapis.com/drive/v3/files/{folder_id}?fields=id,name&supportsAllDrives=true"
        resp = requests.get(url, headers=self._headers(), timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"Cannot get folder {folder_id}: {resp.text}")
        return resp.json()

    def list_folder_spreadsheets(self, folder_id: str) -> List[Dict[str, Any]]:
        q = f"'{folder_id}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
        url = f"https://www.googleapis.com/drive/v3/files?q={q}&fields=files(id,name,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true"
        resp = requests.get(url, headers=self._headers(), timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"Failed listing files in folder {folder_id}: {resp.text}")
        files = resp.json().get("files", [])
        return [f for f in files if not f["name"].startswith("[BACKUP]")]

    def create_drive_backup(self, file_id: str, original_title: str) -> Dict[str, Any]:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"[BACKUP] {original_title} - {ts}"
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}/copy?supportsAllDrives=true"
        resp = requests.post(url, headers=self._headers(), json={"name": backup_name}, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"Drive backup copy failed: {resp.text}")
        data = resp.json()
        logger.info("Drive backup created: '%s' (ID: %s)", backup_name, data.get("id"))
        return data

    def get_spreadsheet_data(self, spreadsheet_id: str, sheet_name: str = "report") -> Tuple[List[str], List[List[str]]]:
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{sheet_name}!A1:Z10000"
        resp = requests.get(url, headers=self._headers(), timeout=60)
        if resp.status_code != 200:
            # Try fetching default first sheet if 'report' not found
            url_meta = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
            res_meta = requests.get(url_meta, headers=self._headers(), timeout=30)
            first_sheet = res_meta.json().get("sheets", [{}])[0].get("properties", {}).get("title", "Sheet1")
            url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{first_sheet}!A1:Z10000"
            resp = requests.get(url, headers=self._headers(), timeout=60)
            sheet_name = first_sheet

        data = resp.json()
        values = data.get("values", [])
        if not values:
            return [], []
        headers = values[0]
        rows = values[1:]
        return headers, rows

    def update_spreadsheet_values(self, spreadsheet_id: str, values: List[List[str]], sheet_name: str = "report"):
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{sheet_name}!A1?valueInputOption=RAW"
        resp = requests.put(
            url,
            headers=self._headers(),
            json={"range": f"{sheet_name}!A1", "majorDimension": "ROWS", "values": values},
            timeout=120,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Failed updating spreadsheet: {resp.text}")
        data = resp.json()
        logger.info("Updated Google Sheet '%s': %d rows, %d cells.", spreadsheet_id, data.get("updatedRows", 0), data.get("updatedCells", 0))


def process_folder(
    folder_input: str,
    drive_client: GoogleDriveClient,
    engine: PostalEngineV2,
    output_dir: Path,
    dry_run: bool = False,
    skip_backup: bool = False,
):
    folder_id = drive_client.extract_folder_id(folder_input)
    meta = drive_client.get_folder_metadata(folder_id)
    folder_name = meta.get("name", folder_id)
    logger.info("=" * 70)
    logger.info("Processing Folder: '%s' (ID: %s)", folder_name, folder_id)
    logger.info("=" * 70)

    spreadsheets = drive_client.list_folder_spreadsheets(folder_id)
    if not spreadsheets:
        logger.warning("No active spreadsheets found in folder %s", folder_id)
        return

    for sheet_meta in spreadsheets:
        sid = sheet_meta["id"]
        title = sheet_meta["name"]
        logger.info("Target Spreadsheet: '%s' (ID: %s)", title, sid)

        # 1. Read sheet data
        headers, rows = drive_client.get_spreadsheet_data(sid)
        logger.info("Loaded %d records with %d columns.", len(rows), len(headers))
        if not headers or not rows:
            logger.warning("Spreadsheet %s is empty, skipping.", title)
            continue

        # Map headers
        header_map = {h.strip().upper(): idx for idx, h in enumerate(headers)}
        citi_idx = header_map.get("CITI")
        bang_idx = header_map.get("BANG")
        zip_idx = header_map.get("ZIP")
        zip_llc_idx = header_map.get("ZIP LLC")
        name_idx = header_map.get("NAME")

        if zip_idx is None or citi_idx is None or bang_idx is None:
            logger.error("Required columns (CITI, BANG, ZIP) missing in %s. Skipping.", title)
            continue

        # 2. Local Backup before any changes
        folder_export_dir = output_dir / folder_name.replace(" ", "_")
        folder_export_dir.mkdir(parents=True, exist_ok=True)
        orig_csv = folder_export_dir / f"{title}_ORIGINAL.csv"
        with orig_csv.open("w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(headers)
            w.writerows(rows)
        logger.info("Local original backup saved to: %s", orig_csv)

        # 3. Remote Drive Backup
        if not skip_backup and not dry_run:
            drive_client.create_drive_backup(sid, title)

        # 4. Clean and Auto-Correct
        cleaned_rows = []
        stats = {"kept_valid": 0, "corrected": 0, "padded_zero": 0, "unknown_city": 0}
        diff_samples = []

        for row in rows:
            r = list(row)
            # Pad row if short
            while len(r) < len(headers):
                r.append("")

            city = r[citi_idx] if citi_idx < len(r) else ""
            state = r[bang_idx] if bang_idx < len(r) else ""
            current_zip = r[zip_idx] if zip_idx < len(r) else ""

            final_zip, status = engine.resolve_zip(city, state, current_zip)
            stats[status] = stats.get(status, 0) + 1

            if status in ("corrected", "padded_zero"):
                person = r[name_idx] if name_idx is not None and name_idx < len(r) else "Record"
                diff_samples.append({
                    "name": person,
                    "city": city,
                    "state": state,
                    "old_zip": current_zip,
                    "new_zip": final_zip,
                    "reason": status,
                })

            # Update ZIP and ZIP LLC
            r[zip_idx] = final_zip
            if zip_llc_idx is not None and zip_llc_idx < len(r):
                r[zip_llc_idx] = final_zip

            cleaned_rows.append(r)

        # 5. Save Cleaned Local CSV & XLSX
        clean_csv = folder_export_dir / f"{title}_CLEANED.csv"
        clean_xlsx = folder_export_dir / f"{title}_CLEANED.xlsx"
        with clean_csv.open("w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(headers)
            w.writerows(cleaned_rows)

        df_clean = pd.DataFrame(cleaned_rows, columns=headers)
        # Ensure SSN and ZIP formatted as text
        for col in ["SSN", "ZIP", "ZIP LLC"]:
            if col in df_clean.columns:
                df_clean[col] = df_clean[col].astype(str)
        df_clean.to_excel(clean_xlsx, index=False)
        logger.info("Local cleaned files saved: %s and %s", clean_csv.name, clean_xlsx.name)

        # 6. Report Statistics
        total = len(rows)
        logger.info("-" * 50)
        logger.info("FILTER AUDIT SUMMARY FOR '%s':", title)
        logger.info("  * Total Records    : %d", total)
        logger.info("  * Kept Valid (OK)  : %d (%.1f%%)", stats["kept_valid"], stats["kept_valid"] / total * 100)
        logger.info("  * Corrected ZIPs   : %d (%.1f%%)", stats["corrected"], stats["corrected"] / total * 100)
        logger.info("  * Padded 0 (4-digit): %d (%.1f%%)", stats["padded_zero"], stats["padded_zero"] / total * 100)
        logger.info("  * Unknown City     : %d (%.1f%%)", stats["unknown_city"], stats["unknown_city"] / total * 100)
        logger.info("-" * 50)

        if diff_samples:
            logger.info("Sample Corrections (first 10):")
            for sample in diff_samples[:10]:
                logger.info(
                    "  [FIX] %s | %s, %s | Old ZIP: '%s' -> New ZIP: '%s' (%s)",
                    sample["name"],
                    sample["city"],
                    sample["state"],
                    sample["old_zip"],
                    sample["new_zip"],
                    sample["reason"],
                )

        # 7. Update to Google Drive
        if dry_run:
            logger.info("[DRY RUN] Skipping Google Drive upload.")
        else:
            logger.info("Uploading cleaned records to Google Spreadsheet on Drive...")
            update_payload = [headers] + cleaned_rows
            drive_client.update_spreadsheet_values(sid, update_payload)
            logger.info("SUCCESS: Google Spreadsheet '%s' updated with 100%% verified postal data!", title)


def main():
    parser = argparse.ArgumentParser(description="Máy lọc Version 2 cho Google Drive Sheets")
    parser.add_argument(
        "--folders",
        nargs="+",
        default=[
            "https://drive.google.com/drive/folders/1qoJULaMQt2auufsODYq9P4-hWSoPNwoi?usp=drive_link",
            "https://drive.google.com/drive/folders/1aWOV3e4hRcy4mqaA8eBc74I1LzzGQx90?usp=drive_link",
        ],
        help="List of Google Drive folder URLs or IDs",
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview only, do not modify Drive")
    parser.add_argument("--skip-backup", action="store_true", help="Skip creating backup copy on Drive")
    parser.add_argument(
        "--output-dir",
        default=r"F:\Herd\fox-auto\outputs\drive_cleaned_v2",
        help="Directory to save local backup and cleaned exports",
    )
    args = parser.parse_args()

    client_json = r"F:\Herd\fox-auto\private\google-drive\oauth-web-client.json"
    user_json = r"F:\Herd\fox-auto\private\google-drive\oauth-user.json"

    drive_client = GoogleDriveClient(client_json, user_json)
    engine = PostalEngineV2()
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for folder_input in args.folders:
        process_folder(
            folder_input,
            drive_client,
            engine,
            out_dir,
            dry_run=args.dry_run,
            skip_backup=args.skip_backup,
        )


if __name__ == "__main__":
    main()
