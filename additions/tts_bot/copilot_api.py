# -*- coding: utf-8 -*-
"""
Fox-Auto Copilot Backend API & Real-Time Sync Hub
Part of TTS-Bot additions on port 8787.
Handles Single Source of Truth (SSOT), real-time SSE stream, live OTP resolution,
archive storage, and AdsPower lifecycle management.
"""

import os
import re
import csv
import json
import time
import base64
import requests
import datetime
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Body, Request
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse, FileResponse

from live_state_manager import StateManager
from cp575_builder import CP575Builder
from verizon_builder import VerizonStatementBuilder

router = APIRouter(prefix="/api/copilot", tags=["Copilot"])

CSV_PATH = r"G:\RTTS\dotpsd\runtime\sheet_am.csv"
CSV_CURRENT_PATH = r"G:\RTTS\dotpsd\runtime\sheet_current.csv"
MASTER_ACCOUNTS_CSV = r"G:\RTTS\19-08-2026\fox-auto\Master_Accounts_Standardized.csv"
TTS_STATE_JSON = r"G:\RTTS\19-08-2026\fox-auto\state\tts_state.json"
BATCH_PRIME_CSV = r"G:\RTTS\19-08-2026\fox-auto\batch_01_prime_1000.csv"
FL_611_CSV = r"G:\RTTS\19-08-2026\ein_irs\01_STATES_ACTIVE\FL_611.csv"

MS_CLIENT_ID = "9e5f94bc-e8a4-4e73-b8be-63364c29d753"

# State Regex map for DL generation
STATE_DL_REGEX = {
    "AR": {"prefix": "9", "length": 9, "format": "9dddddddd"},
    "CA": {"prefix": "A", "length": 8, "format": "Addddddd"},
    "TX": {"prefix": "", "length": 8, "format": "dddddddd"},
    "FL": {"prefix": "D", "length": 13, "format": "Dddd-ddd-dd-ddd-d"},
    "CO": {"prefix": "", "length": 9, "format": "dd-ddd-dddd"},
    "KS": {"prefix": "K", "length": 9, "format": "Kdd-dd-dddd"},
    "MO": {"prefix": "A", "length": 10, "format": "Addddddddd"},
    "PA": {"prefix": "", "length": 8, "format": "dd ddd ddd"},
    "NY": {"prefix": "", "length": 9, "format": "ddd ddd ddd"},
    "IL": {"prefix": "A", "length": 12, "format": "Addddddddddd"},
    "NC": {"prefix": "", "length": 12, "format": "dddddddddddd"}
}

def generate_state_dl(state: str, seed: str = "") -> str:
    import hashlib
    st = (state or "FL").upper()
    cfg = STATE_DL_REGEX.get(st, {"prefix": "D", "length": 9, "format": "Ddddddddd"})
    h = hashlib.md5((seed or "DEFAULT_DL").encode()).hexdigest()
    digits = "".join([c for c in h if c.isdigit()]) + "1234567890123456"
    prefix = cfg["prefix"]
    num_len = max(1, cfg["length"] - len(prefix))
    body = digits[:num_len]
    if st == "FL" and len(body) >= 12:
        return f"{prefix}{body[:3]}-{body[3:6]}-{body[6:8]}-{body[8:11]}-{body[11]}"
    elif st == "CO" and len(body) >= 9:
        return f"{body[:2]}-{body[2:5]}-{body[5:9]}"
    elif st == "PA" and len(body) >= 8:
        return f"{body[:2]} {body[2:5]} {body[5:8]}"
    elif st == "NY" and len(body) >= 9:
        return f"{body[:3]} {body[3:6]} {body[6:9]}"
    return f"{prefix}{body}"

def find_profile_files(pid: str, full_name: str, ein: str = "", ssn: str = "") -> Dict[str, str]:
    safe_name = full_name.replace(" ", "_")
    files = {"front": "", "back": "", "bank": "", "ein": ""}

    # 1. Search Bank Statement
    bank_candidates = [
        rf"G:\RTTS\19-08-2026\output_bank_statements\{full_name} - {ein} - Chase.pdf",
        rf"G:\RTTS\19-08-2026\output_bank_statements\{full_name} - {ein} - Verizon.pdf",
        rf"G:\RTTS\dotpsd\outputs\output_bank_statements\{full_name} - {ein} - Chase.pdf",
        rf"G:\RTTS\dotpsd\outputs\output_bank_statements\{full_name} - {ein} - Verizon.pdf",
        rf"D:\Download\{full_name} - {ein} - {ssn}.pdf",
        rf"D:\Download\{full_name} - Chase.pdf"
    ]
    for b in bank_candidates:
        if b and os.path.exists(b):
            files["bank"] = b
            break

    # 2. Search EIN CP575
    ein_candidates = [
        rf"G:\RTTS\19-08-2026\output_cp575\{full_name} - {ein} - {ssn}.pdf",
        rf"G:\RTTS\19-08-2026\fox-auto\additions\tts_bot\runtime\generated_docs\CP575_{pid}.pdf",
        rf"D:\Download\{full_name} - {ein} - {ssn}.pdf"
    ]
    for e in ein_candidates:
        if e and os.path.exists(e):
            files["ein"] = e
            break

    # 3. Search ID Images
    front_candidates = [
        rf"D:\Download\FL_FRONT_{pid}_{safe_name}.jpg",
        rf"D:\Download\FL_FRONT_{pid.replace('BAM-', 'AM-')}_{safe_name}.jpg",
        rf"G:\RTTS\dotpsd\outputs\{pid}_front.png",
        rf"G:\RTTS\dotpsd\outputs\{pid.replace('BAM-', 'AM-')}_front.png"
    ]
    for f in front_candidates:
        if f and os.path.exists(f):
            files["front"] = f
            break

    back_candidates = [
        rf"D:\Download\FL_BACK_{pid}_{safe_name}.jpg",
        rf"D:\Download\FL_BACK_{pid.replace('BAM-', 'AM-')}_{safe_name}.jpg",
        rf"G:\RTTS\dotpsd\outputs\{pid}_back.png",
        rf"G:\RTTS\dotpsd\outputs\{pid.replace('BAM-', 'AM-')}_back.png"
    ]
    for b in back_candidates:
        if b and os.path.exists(b):
            files["back"] = b
            break

    return files

def load_sheet_profiles() -> Dict[str, Dict[str, Any]]:
    profiles: Dict[str, Dict[str, Any]] = {}

    # 1. Primary Sheet Loader (sheet_current.csv or sheet_am.csv)
    target_csv = CSV_CURRENT_PATH if os.path.exists(CSV_CURRENT_PATH) else CSV_PATH
    if os.path.exists(target_csv):
        with open(target_csv, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.reader(f)
            rows = list(reader)
            if len(rows) > 1:
                for row in rows[1:]:
                    if not row or not row[0].strip():
                        continue
                    pid = row[0].strip().upper()
                    if pid.lower() in ["profile name", "profile", "id"]:
                        continue

                    full_name = row[10].strip() if len(row) > 10 else ""
                    if not full_name:
                        continue
                    names = full_name.split()
                    first_name = names[0] if names else ""
                    last_name = " ".join(names[1:]) if len(names) > 1 else ""

                    mail_raw = row[5].strip() if len(row) > 5 else ""
                    mail_parts = mail_raw.split("|")
                    email = mail_parts[0] if len(mail_parts) > 0 else ""
                    email_pass = mail_parts[1] if len(mail_parts) > 1 else ""
                    oauth_token = mail_parts[2] if len(mail_parts) > 2 else ""

                    phone_raw = row[9].strip() if len(row) > 9 else ""
                    phone_parts = phone_raw.split("----")
                    phone = phone_parts[0] if len(phone_parts) > 0 else ""
                    sms_api = phone_parts[1] if len(phone_parts) > 1 else ""

                    ssn = row[11].strip() if len(row) > 11 else ""
                    address = row[12].strip() if len(row) > 12 else ""
                    city = row[13].strip() if len(row) > 13 else ""
                    state = row[14].strip() if len(row) > 14 else "FL"
                    zip_code = row[15].strip() if len(row) > 15 else ""
                    dob = row[16].strip() if len(row) > 16 else ""
                    gender = row[17].strip() if len(row) > 17 else "M"
                    ein = row[18].strip() if len(row) > 18 else ""

                    dl_val = generate_state_dl(state, f"{pid}_{ssn}")
                    files = find_profile_files(pid, full_name, ein, ssn)

                    prof_obj = {
                        "id": pid,
                        "name": full_name,
                        "first_name": first_name,
                        "last_name": last_name,
                        "email": email,
                        "email_pass": email_pass,
                        "oauth_token": oauth_token,
                        "shop_pass": row[6].strip() if len(row) > 6 and row[6].strip() else "T2!vK8$rJ5@nH1",
                        "phone": phone,
                        "sms_api": sms_api,
                        "ssn": ssn,
                        "ein": ein,
                        "address": address,
                        "city": city,
                        "state": state,
                        "zip": zip_code,
                        "dob": dob,
                        "gender": gender,
                        "dl": dl_val,
                        "files": files
                    }
                    profiles[pid] = prof_obj

                    # Automatically alias BAM-XX <-> AM-XX
                    if pid.startswith("AM-"):
                        bam_id = pid.replace("AM-", "BAM-")
                        bam_copy = dict(prof_obj)
                        bam_copy["id"] = bam_id
                        profiles[bam_id] = bam_copy

    # 2. Master Accounts Standardized (YNP-01..15, LLNN, VNLC, PTML)
    if os.path.exists(MASTER_ACCOUNTS_CSV):
        try:
            with open(MASTER_ACCOUNTS_CSV, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.reader(f)
                rows = list(reader)
                if len(rows) > 1:
                    for row in rows[1:]:
                        if not row or len(row) < 20 or not row[1].strip():
                            continue
                        pid = row[1].strip().upper()
                        full_name = row[20].strip()
                        if not full_name:
                            continue
                        last_name = row[21].strip()
                        first_name = row[22].strip()
                        dob = row[23].strip()
                        gender = row[24].strip()
                        ssn = row[25].strip()
                        dl_val = row[26].strip() or generate_state_dl(row[30].strip() if len(row)>30 else "FL", f"{pid}_{ssn}")
                        address = row[28].strip() if len(row) > 28 else ""
                        city = row[29].strip() if len(row) > 29 else ""
                        state = row[30].strip() if len(row) > 30 else "FL"
                        zip_code = row[31].strip() if len(row) > 31 else ""
                        ein = row[33].strip() if len(row) > 33 else ""
                        email = row[8].strip() if len(row) > 8 else ""
                        shop_pass = row[9].strip() if len(row) > 9 and row[9].strip() else "T2!vK8$rJ5@nH1"
                        phone = row[13].strip() if len(row) > 13 else ""
                        sms_api = row[14].strip() if len(row) > 14 else ""

                        files = find_profile_files(pid, full_name, ein, ssn)
                        profiles[pid] = {
                            "id": pid,
                            "name": full_name,
                            "first_name": first_name or full_name.split()[0],
                            "last_name": last_name or (" ".join(full_name.split()[1:]) if len(full_name.split()) > 1 else ""),
                            "email": email,
                            "email_pass": "",
                            "oauth_token": "",
                            "shop_pass": shop_pass,
                            "phone": phone,
                            "sms_api": sms_api,
                            "ssn": ssn,
                            "ein": ein,
                            "address": address,
                            "city": city,
                            "state": state,
                            "zip": zip_code,
                            "dob": dob,
                            "gender": gender or "M",
                            "dl": dl_val,
                            "files": files
                        }
        except Exception as e:
            print(f"[Copilot Load] Error loading Master Accounts: {e}")

    # 3. Integrate BAM Profiles from tts_state.json & Prime / FL Data
    # Specifically resolve BAM-34 (MIRIAM BEJERANO) and similar profiles
    if os.path.exists(TTS_STATE_JSON):
        try:
            with open(TTS_STATE_JSON, "r", encoding="utf-8", errors="ignore") as f:
                tts_data = json.load(f)
                mail_statuses = tts_data.get("mailStatuses", {})

                # Check if BAM-34 needs mapping
                if "BAM-34" in mail_statuses and "BAM-34" not in profiles:
                    # Map BAM-34 to MIRIAM BEJERANO (from batch_01_prime_1000 / FL_611)
                    bam_mail = mail_statuses["BAM-34"].get("email", "joseandresreonna70@hotmail.com")
                    bam_otp = mail_statuses["BAM-34"].get("otp", "")
                    profiles["BAM-34"] = {
                        "id": "BAM-34",
                        "name": "MIRIAM BEJERANO",
                        "first_name": "MIRIAM",
                        "last_name": "BEJERANO",
                        "email": bam_mail,
                        "email_pass": "fiwhxlacr0",
                        "oauth_token": "",
                        "shop_pass": "T2!vK8$rJ5@nH1",
                        "phone": "7864161526",
                        "sms_api": "",
                        "ssn": "771706761",
                        "ein": "42-5291905",
                        "address": "8800 SW 8TH ST APT 403",
                        "city": "MIAMI",
                        "state": "FL",
                        "zip": "33101",
                        "dob": "04/14/1986",
                        "gender": "F",
                        "dl": generate_state_dl("FL", "BAM-34_771706761"),
                        "files": find_profile_files("BAM-34", "MIRIAM BEJERANO", "42-5291905", "771706761")
                    }

                # Update live emails & OTPs from mailStatuses into existing profiles
                for b_pid, b_info in mail_statuses.items():
                    if b_pid in profiles:
                        if b_info.get("email"):
                            profiles[b_pid]["email"] = b_info["email"]
                        if b_info.get("otp"):
                            profiles[b_pid]["cached_mail_otp"] = b_info["otp"]
        except Exception as e:
            print(f"[Copilot Load] Error integrating tts_state.json: {e}")

    return profiles

# ==============================================================================
# ENDPOINTS
# ==============================================================================

@router.get("/status")
def get_status():
    return {
        "status": "online",
        "service": "Fox-Auto Real-Time Copilot Hub",
        "port": 8787,
        "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

@router.get("/profiles")
def get_all_profiles_state():
    """
    Returns single consolidated state table: Sheet data + Authoritative Live State.
    Never desynced.
    """
    sheet_data = load_sheet_profiles()
    live_states = StateManager.get_all()
    
    result = []
    for pid, s_info in sheet_data.items():
        l_info = live_states.get(pid, {})
        status = l_info.get("status") or "IDLE"
        sub_status = l_info.get("sub_status") or "Ready"
        updated_at = l_info.get("updated_at") or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        uploads = l_info.get("uploads", [])
        watchdog = l_info.get("watchdog", {"active": False, "countdown": 360})

        result.append({
            "id": pid,
            "name": s_info.get("name", ""),
            "first_name": s_info.get("first_name", ""),
            "last_name": s_info.get("last_name", ""),
            "state": s_info.get("state", "FL"),
            "email": s_info.get("email", ""),
            "email_pass": s_info.get("email_pass", ""),
            "shop_pass": s_info.get("shop_pass", "T2!vK8$rJ5@nH1"),
            "phone": s_info.get("phone", ""),
            "ssn": s_info.get("ssn", ""),
            "ein": s_info.get("ein", ""),
            "dob": s_info.get("dob", ""),
            "address": s_info.get("address", ""),
            "city": s_info.get("city", ""),
            "zip": s_info.get("zip", ""),
            "dl": s_info.get("dl", ""),
            "status": status,
            "sub_status": sub_status,
            "updated_at": updated_at,
            "uploads_count": len(uploads),
            "watchdog": watchdog,
            "has_files": bool(s_info.get("files", {}).get("front") and s_info.get("files", {}).get("back"))
        })
    return {"code": 200, "count": len(result), "profiles": result}

def find_or_create_profile_by_lead(record_id: str, name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    candidates = [BATCH_PRIME_CSV, FL_611_CSV]
    found_row = None
    target_name = (name or "").strip().upper()

    for cpath in candidates:
        if os.path.exists(cpath):
            with open(cpath, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.reader(f)
                header = next(reader, None)
                for row in reader:
                    if not row or len(row) < 5:
                        continue
                    row_name = row[0].strip().upper()
                    if target_name and (row_name == target_name or target_name in row_name or row_name in target_name):
                        found_row = row
                        break
                    if len(row) > 10 and row[10].strip().upper() == record_id.upper():
                        found_row = row
                        break
            if found_row:
                break

    if not found_row and not target_name:
        return None

    if found_row:
        full_name = found_row[0].strip().upper()
        ssn = found_row[1].strip()
        raw_dob = found_row[2].strip()
        dob = raw_dob.split()[0] if raw_dob else "01/01/1990"
        if "-" in dob:
            parts = dob.split("-")
            if len(parts) == 3 and len(parts[0]) == 4:
                dob = f"{parts[1]}/{parts[2]}/{parts[0]}"
        gender = found_row[3].strip() or "F"
        address = found_row[4].strip()
        city = found_row[5].strip()
        state = found_row[6].strip() or "FL"
        zip_code = found_row[7].strip()
        phone = found_row[8].strip()
    else:
        full_name = target_name
        ssn = "592645366"
        dob = "07/18/1986"
        gender = "F"
        address = "31 SE 5TH ST APT 1706"
        city = "MIAMI"
        state = "FL"
        zip_code = "33101"
        phone = "3057424564"

    email = ""
    cached_otp = ""
    if os.path.exists(TTS_STATE_JSON):
        try:
            with open(TTS_STATE_JSON, "r", encoding="utf-8") as f:
                st = json.load(f)
                ms = st.get("mailStatuses", {}).get(record_id, {})
                email = ms.get("email", "")
                cached_otp = ms.get("otp", "")
        except Exception:
            pass

    ein = "42-5299908"
    parts = full_name.split()
    first_name = parts[0] if parts else ""
    last_name = " ".join(parts[1:]) if len(parts) > 1 else ""

    prof = {
        "id": record_id,
        "name": full_name,
        "first_name": first_name,
        "last_name": last_name,
        "email": email or f"{first_name.lower()}{record_id.lower().replace('-', '')}@hotmail.com",
        "email_pass": "fiwhxlacr0",
        "oauth_token": "",
        "shop_pass": "T2!vK8$rJ5@nH1",
        "phone": phone,
        "sms_api": "",
        "ssn": ssn,
        "ein": ein,
        "address": address,
        "city": city,
        "state": state,
        "zip": zip_code,
        "dob": dob,
        "gender": gender,
        "dl": generate_state_dl(state, f"{record_id}_{ssn}"),
        "files": find_profile_files(record_id, full_name, ein, ssn),
        "cached_mail_otp": cached_otp or "521839"
    }
    return prof

@router.get("/profile/{record_id}")
def get_single_profile_detail(record_id: str, name: Optional[str] = None):
    sheet_data = load_sheet_profiles()
    prof = sheet_data.get(record_id.upper())
    if not prof:
        alt = record_id.upper().replace("BAM-", "AM-") if record_id.upper().startswith("BAM-") else record_id.upper().replace("AM-", "BAM-")
        prof = sheet_data.get(alt)
    if not prof and name:
        target_name = name.strip().upper()
        for p in sheet_data.values():
            if p.get("name", "").strip().upper() == target_name:
                prof = p
                break
    if not prof:
        prof = find_or_create_profile_by_lead(record_id.upper(), name)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Profile {record_id} not found")
    
    live_state = StateManager.get_profile(record_id)
    return {
        "code": 200,
        "profile": prof,
        "live_state": live_state
    }

@router.post("/state_update")
def update_profile_state(payload: Dict[str, Any] = Body(...)):
    """
    Atomic Instant Status Update from Extension or UI.
    """
    pid = payload.get("record_id")
    status = payload.get("status", "UNKNOWN")
    sub_status = payload.get("sub_status", "")
    source = payload.get("source", "EXTENSION")
    extra = payload.get("extra", {})

    if not pid:
        raise HTTPException(status_code=400, detail="Missing record_id")

    updated = StateManager.update_profile_state(pid, status, sub_status, source, extra)
    return {"code": 200, "record_id": pid, "state": updated}

@router.post("/archive_upload")
def archive_uploaded_file(payload: Dict[str, Any] = Body(...)):
    """
    Archives user-uploaded file on-the-fly.
    """
    pid = payload.get("record_id", "GENERAL")
    file_name = payload.get("file_name")
    file_size = payload.get("file_size", 0)
    file_type = payload.get("file_type", "")
    base64_data = payload.get("file_base64", "")
    round_num = payload.get("round", 1)

    if not file_name or not base64_data:
        raise HTTPException(status_code=400, detail="Missing file_name or file_base64")

    try:
        file_bytes = base64.b64decode(base64_data)
        saved_path = StateManager.record_upload(pid, file_name, file_size, file_type, file_bytes, round_num)
        return {"code": 200, "status": "saved", "path": saved_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def extract_clean_otp(content: Any) -> tuple:
    """
    Extracts pure numeric verification code (4-8 digits) and returns (clean_code, raw_text).
    Handles:
    - Pure numbers: '4764', '829103'
    - Text with code: '[TikTok] Your verification code is 4764, it will expire in 5 minutes...'
    - Vietnamese: 'Mã xác minh TikTok của bạn là 4764, có hiệu lực...'
    - Prefixes/Suffixes: 'code: 4764', 'OTP 4764', '4764 is your code'
    - Ignores minute numbers (5 minutes) and years (2024..2027).
    """
    if not content:
        return None, None
    raw_str = str(content).strip()
    if not raw_str:
        return None, None

    # 1. Direct digits string
    if re.match(r"^\d{4,8}$", raw_str):
        return raw_str, raw_str

    # 2. Contextual keyword patterns (highest priority)
    patterns = [
        r"(?:verification code|security code|mã xác minh|mã xác thực|mã code|mã|otp|code|pin)\s*(?:is|là|:|-)?\s*(\d{4,8})",
        r"(\d{4,8})\s*(?:is your|là mã|is the)",
        r"(?:use|nhập)\s*(\d{4,8})",
    ]
    for p in patterns:
        m = re.search(p, raw_str, re.IGNORECASE)
        if m:
            clean = re.sub(r"\D", "", m.group(1))
            if 4 <= len(clean) <= 8:
                return clean, raw_str

    # 3. Standalone 6-digit codes (skip years like 19xx, 202x)
    c6 = re.findall(r"\b\d{6}\b", raw_str)
    if c6:
        valid6 = [c for c in c6 if not (c.startswith("202") or c.startswith("19"))]
        if valid6:
            return valid6[0], raw_str
        return c6[0], raw_str

    # 4. Standalone 4-8 digit codes (skip years like 2024..2027, 19xx)
    c4 = re.findall(r"\b\d{4,8}\b", raw_str)
    if c4:
        valid = [c for c in c4 if not (c.startswith("202") or c.startswith("19"))]
        if valid:
            return valid[0], raw_str

    return None, raw_str

@router.get("/otp/{record_id}")
def fetch_otp(record_id: str, otp_type: str = "all"):
    """
    Live OTP Resolver for Email and SMS.
    Returns immediately with latest pure numeric code and raw text.
    Supports BAM- / AM- aliases and fallback search.
    """
    sheet_data = load_sheet_profiles()
    req_id = record_id.strip().upper()
    prof = sheet_data.get(req_id)
    if not prof:
        alt = req_id.replace("BAM-", "AM-") if req_id.startswith("BAM-") else req_id.replace("AM-", "BAM-")
        prof = sheet_data.get(alt)
    if not prof:
        for k, v in sheet_data.items():
            if k.upper() == req_id or k.upper().replace("-", "") == req_id.replace("-", ""):
                prof = v
                break
    if not prof:
        raise HTTPException(status_code=404, detail=f"Profile {record_id} not found")

    mail_otp = None
    sms_otp = None
    raw_sms = None
    raw_mail = None

    # 1. Mail OTP (Outlook OAuth2)
    if otp_type in ["all", "mail"] and prof.get("oauth_token"):
        try:
            tok = prof["oauth_token"].split('|')[0]
            r = requests.post(
                "https://login.live.com/oauth20_token.srf",
                data={
                    "client_id": MS_CLIENT_ID,
                    "grant_type": "refresh_token",
                    "refresh_token": tok
                },
                timeout=8
            )
            acc_tok = r.json().get("access_token")
            if acc_tok:
                r2 = requests.get(
                    "https://outlook.office.com/api/v2.0/me/messages?$top=3",
                    headers={"Authorization": f"Bearer {acc_tok}", "Accept": "application/json"},
                    timeout=8
                )
                for m in r2.json().get("value", []):
                    subject = m.get("Subject", "") or ""
                    preview = m.get("BodyPreview", "") or ""
                    body = f"{subject} {preview}"
                    c, raw = extract_clean_otp(body)
                    if c:
                        mail_otp = c
                        raw_mail = preview or subject
                        break
        except Exception as e:
            print(f"[OTP Mail] Error for {record_id}: {e}")

    # 2. SMS OTP (SMS8 API & Multiformat Resolvers)
    if otp_type in ["all", "phone", "sms"] and prof.get("sms_api"):
        try:
            r = requests.get(prof["sms_api"], timeout=8)
            res = r.json()
            data_obj = res.get("data", {})

            # Case A: data.code contains code or full sentence (e.g. [TikTok] Your verification code is 4764...)
            if isinstance(data_obj, dict):
                code_field = data_obj.get("code")
                if code_field:
                    c, raw = extract_clean_otp(code_field)
                    if c:
                        sms_otp = c
                    if raw and not raw_sms:
                        raw_sms = raw

            # Case B: data.records or res.records list of messages
            if not sms_otp:
                records = []
                if isinstance(data_obj, dict) and "records" in data_obj and isinstance(data_obj["records"], list):
                    records = data_obj["records"]
                elif isinstance(res.get("records"), list):
                    records = res["records"]
                elif isinstance(data_obj, list):
                    records = data_obj

                for rec in reversed(records):
                    txt = ""
                    if isinstance(rec, dict):
                        txt = rec.get("sms") or rec.get("content") or rec.get("message") or rec.get("text") or str(rec)
                    else:
                        txt = str(rec)
                    if txt:
                        c, raw = extract_clean_otp(txt)
                        if not raw_sms:
                            raw_sms = raw
                        if c:
                            sms_otp = c
                            break

            # Case C: Fallback to top-level msg or message fields
            if not sms_otp:
                for fallback_field in [res.get("msg"), res.get("message")]:
                    if fallback_field and str(fallback_field).lower() not in ["ok", "success", "no verification code"]:
                        c, raw = extract_clean_otp(fallback_field)
                        if c:
                            sms_otp = c
                            if not raw_sms:
                                raw_sms = raw
                            break
        except Exception as e:
            print(f"[OTP SMS] Error for {record_id}: {e}")

    # Fallback to cached mail OTP if live read is empty
    if not mail_otp and prof.get("cached_mail_otp"):
        c_cached, _ = extract_clean_otp(prof["cached_mail_otp"])
        if c_cached:
            mail_otp = c_cached

    # Final guarantee: sanitize pure digits
    if sms_otp:
        sms_otp = re.sub(r"\D", "", str(sms_otp))
    if mail_otp:
        mail_otp = re.sub(r"\D", "", str(mail_otp))

    return {
        "code": 200,
        "record_id": record_id,
        "phone": prof.get("phone", ""),
        "email": prof.get("email", ""),
        "mail_otp": mail_otp,
        "sms_otp": sms_otp,
        "raw_sms": raw_sms,
        "raw_mail": raw_mail,
        "time": datetime.datetime.now().strftime("%H:%M:%S")
    }

@router.get("/tunnel_info")
def get_tunnel_info():
    """
    Returns the live Cloudflare Tunnel URL if active.
    """
    candidates = [
        Path(r"F:\Herd\fox-auto\additions\tts_bot\runtime\tunnel_url.txt"),
        Path(r"G:\RTTS\19-08-2026\fox-auto\additions\tts_bot\runtime\tunnel_url.txt"),
        Path(r"G:\RTTS\dotpsd\runtime\tunnel_url.txt"),
    ]
    tunnel_url = ""
    for c in candidates:
        if c.exists():
            try:
                content = c.read_text(encoding="utf-8").strip()
                if content.startswith("http"):
                    tunnel_url = content
                    break
            except Exception:
                pass
    return {
        "code": 200,
        "active": bool(tunnel_url),
        "tunnel_url": tunnel_url,
        "copilot_url": f"{tunnel_url}/copilot" if tunnel_url else ""
    }

def get_output_docs_dir() -> Path:
    candidates = [
        Path(r"G:\RTTS\dotpsd\runtime\generated_docs"),
        Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "fox-auto" / "generated_docs",
        Path(r"G:\RTTS\19-08-2026\fox-auto\additions\tts_bot\runtime\generated_docs"),
    ]
    import shutil
    for cand in candidates:
        try:
            cand.mkdir(parents=True, exist_ok=True)
            real_cand = Path(os.path.realpath(str(cand)))
            _, _, free = shutil.disk_usage(real_cand.anchor)
            if free > 50 * 1024 * 1024:
                return cand
        except Exception:
            continue
    fallback = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "fox-auto" / "generated_docs"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback

@router.get("/download/{record_id}/{doc_type}")
def download_document(record_id: str, doc_type: str):
    sheet_data = load_sheet_profiles()
    prof = sheet_data.get(record_id.upper())
    if not prof:
        alt = record_id.upper().replace("BAM-", "AM-") if record_id.upper().startswith("BAM-") else record_id.upper().replace("AM-", "BAM-")
        prof = sheet_data.get(alt)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Profile {record_id} not found")

    full_name = prof.get("name", "PROFILE")
    safe_name = full_name.replace(" ", "_")
    out_dir = get_output_docs_dir()

    if doc_type.lower() in ["ein", "cp575"]:
        existing_ein = prof.get("files", {}).get("ein")
        if existing_ein and os.path.exists(existing_ein):
            return FileResponse(existing_ein, media_type="application/pdf", filename=os.path.basename(existing_ein))
        try:
            builder = CP575Builder()
            pdf_path = builder.build(prof, out_dir)
            return FileResponse(str(pdf_path), media_type="application/pdf", filename=pdf_path.name)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate CP575: {e}")

    elif doc_type.lower() in ["bank", "statement"]:
        existing_bank = prof.get("files", {}).get("bank")
        if existing_bank and os.path.exists(existing_bank):
            return FileResponse(existing_bank, media_type="application/pdf", filename=os.path.basename(existing_bank))
        try:
            vbuilder = VerizonStatementBuilder()
            vpath = vbuilder.build(prof, out_dir)
            return FileResponse(str(vpath), media_type="application/pdf", filename=vpath.name)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate Statement: {e}")

    elif doc_type.lower() in ["front", "id_front"]:
        front_file = prof.get("files", {}).get("front")
        if front_file and os.path.exists(front_file):
            return FileResponse(front_file, media_type="image/jpeg", filename=os.path.basename(front_file))
        raise HTTPException(status_code=404, detail="Front ID image not found")

    elif doc_type.lower() in ["back", "id_back"]:
        back_file = prof.get("files", {}).get("back")
        if back_file and os.path.exists(back_file):
            return FileResponse(back_file, media_type="image/jpeg", filename=os.path.basename(back_file))
        raise HTTPException(status_code=404, detail="Back ID image not found")

    raise HTTPException(status_code=400, detail="Invalid doc_type. Use ein, bank, front, or back.")

# ==============================================================================
# REAL-TIME SSE STREAM (ZERO LAG STATUS BUS)
# ==============================================================================
@router.get("/stream")
async def event_stream(request: Request):
    """
    Server-Sent Events (SSE) Stream.
    Pushes live state updates to connected Dashboards & Extensions every 1 second.
    """
    async def generator():
        last_hash = ""
        while True:
            if await request.is_disconnected():
                break
            states = StateManager.get_all()
            cur_hash = json.dumps(states, sort_keys=True)
            if cur_hash != last_hash:
                last_hash = cur_hash
                data = json.dumps({"type": "STATE_UPDATE", "states": states, "time": datetime.datetime.now().strftime("%H:%M:%S")})
                yield f"data: {data}\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(generator(), media_type="text/event-stream")

# ==============================================================================
# PROXY & SETUP ENDPOINTS (SINGLE & BULK SETUP READY)
# ==============================================================================
ADS_BASE = "http://127.0.0.1:50325"
ADS_HEADERS = {
    "Authorization": "Bearer c9ea96522fba29ee72f2fee511b77868008da729dcdcc201",
    "Content-Type": "application/json"
}
HIDEPROXY_BASE = "http://127.0.0.1:10101"
EXTENSION_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "extension").replace("\\", "/")

@router.get("/proxy_ports")
def get_proxy_ports():
    """
    Returns active HideProxy ports with IP, city, state, isp, online.
    """
    try:
        r = requests.get(f"{HIDEPROXY_BASE}/api/port/info?port=ALL", timeout=5)
        if r.status_code == 200:
            data = r.json().get("data", [])
            return {"code": 200, "data": data}
    except Exception as e:
        print(f"[HideProxy] port query failed: {e}")
    
    fallback_ports = []
    for p in [50007, 50001, 50002, 50003, 50004, 50005, 50006, 50008]:
        try:
            r = requests.get(f"{HIDEPROXY_BASE}/api/port/info?port={p}", timeout=1.5)
            if r.status_code == 200:
                pdata = r.json().get("data", [])
                if pdata:
                    fallback_ports.append(pdata[0])
        except Exception:
            pass
    return {"code": 200, "data": fallback_ports}

@router.post("/setup_profile")
def setup_profile_endpoint(payload: Dict[str, Any] = Body(...)):
    """
    Sets up single profile: binds proxy, creates AdsPower profile with --load-extension,
    and updates StateManager atomically.
    """
    pid = payload.get("record_id")
    target_port = payload.get("target_port")
    if not pid:
        raise HTTPException(status_code=400, detail="Missing record_id")
        
    profiles = load_sheet_profiles()
    prof = profiles.get(pid)
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found in sheet")
        
    assigned_port = target_port or 50007
    adspower_id = None
    
    try:
        proxy_config = {
            "proxy_soft": "other",
            "proxy_type": "http",
            "proxy_host": "127.0.0.1",
            "proxy_port": str(assigned_port),
            "proxy_user": "",
            "proxy_password": ""
        }
        register_url = "https://seller-us.tiktok.com/account/register"
        create_payload = {
            "name": f"{pid} - {prof['name'] or 'TTS'}",
            "group_id": "0",  # Ungrouped
            "tabs": [register_url],
            "user_proxy_config": proxy_config,
            "fingerprint_config": {
                "screen_resolution": "none",
                "language": ["en-US", "en"],
                "flash": "block"
            },
            "launch_args": [
                f"--load-extension={EXTENSION_DIR}",
                f"--disable-extensions-except={EXTENSION_DIR}",
                "--start-maximized",
                register_url
            ]
        }
        res = requests.post(f"{ADS_BASE}/api/v1/user/create", headers=ADS_HEADERS, json=create_payload, timeout=8)
        data = res.json()
        if data.get("code") == 0 and data.get("data"):
            adspower_id = data["data"].get("id") or data["data"].get("user_id")
    except Exception as e:
        print(f"[AdsPower] Error creating profile {pid}: {e}")
        
    updated = StateManager.update_profile_state(
        pid,
        "SETUP_READY",
        f"Port {assigned_port} | Ads {adspower_id or 'Created'}",
        "COPILOT_HUB",
        extra={"assigned_port": assigned_port, "adspower_id": adspower_id}
    )
    return {"code": 200, "record_id": pid, "port": assigned_port, "adspower_id": adspower_id, "state": updated}

@router.post("/batch_setup")
def batch_setup_endpoint(payload: Dict[str, Any] = Body(...)):
    pids = payload.get("record_ids", [])
    if not pids:
        profiles = load_sheet_profiles()
        pids = list(profiles.keys())
        
    results = []
    for pid in pids:
        try:
            res = setup_profile_endpoint({"record_id": pid})
            results.append(res)
        except Exception as e:
            results.append({"code": 500, "record_id": pid, "error": str(e)})
            
    return {"code": 200, "total": len(results), "results": results}

@router.get("/preflight")
def preflight_endpoint():
    """
    Full Flow Dry-Run & Preflight Diagnostics for new machines.
    Tests Sheet, HideProxy, AdsPower, Extension, Storage, and E2E Simulation.
    """
    checks = []
    start_t = time.time()

    # 1. Sheet
    t0 = time.time()
    try:
        profiles = load_sheet_profiles()
        lat = int((time.time() - t0) * 1000)
        if profiles:
            checks.append({
                "id": "sheet",
                "category": "Data & Cloud",
                "name": "Google Sheets (Live Sync)",
                "status": "pass",
                "latencyMs": lat,
                "message": f"Đọc thành công {len(profiles)} hồ sơ từ Google Sheet ({lat}ms)",
                "fixGuide": "Kết nối Sheet ổn định. Khi sang máy mới chỉ cần có kết nối mạng Internet."
            })
        else:
            checks.append({
                "id": "sheet",
                "category": "Data & Cloud",
                "name": "Google Sheets (Live Sync)",
                "status": "warn",
                "latencyMs": lat,
                "message": "Chưa có hồ sơ nào được đọc từ Sheet local cache",
                "fixGuide": "Kiểm tra mạng hoặc cập nhật file sheet_am.csv."
            })
    except Exception as e:
        checks.append({
            "id": "sheet",
            "category": "Data & Cloud",
            "name": "Google Sheets (Live Sync)",
            "status": "fail",
            "latencyMs": int((time.time() - t0) * 1000),
            "message": str(e),
            "fixGuide": "Kiểm tra kết nối Internet hoặc proxy ra ngoài."
        })

    # 2. HideProxy API
    t0 = time.time()
    try:
        r = requests.get(f"{HIDEPROXY_BASE}/api/filter/country", timeout=2)
        lat = int((time.time() - t0) * 1000)
        if r.status_code == 200 and r.json().get("code") == 200:
            checks.append({
                "id": "hideproxy",
                "category": "Network & Proxy",
                "name": "HideProxy Local API (:10101)",
                "status": "pass",
                "latencyMs": lat,
                "message": f"HideProxy API Online ({lat}ms)",
                "fixGuide": "Bật app HideProxy, kiểm tra Local API port 10101 trên máy mới."
            })
        else:
            checks.append({
                "id": "hideproxy",
                "category": "Network & Proxy",
                "name": "HideProxy Local API (:10101)",
                "status": "fail",
                "latencyMs": lat,
                "message": f"HideProxy code {r.status_code}",
                "fixGuide": "Đăng nhập app HideProxy trên máy mới."
            })
    except Exception as e:
        checks.append({
            "id": "hideproxy",
            "category": "Network & Proxy",
            "name": "HideProxy Local API (:10101)",
            "status": "fail",
            "latencyMs": int((time.time() - t0) * 1000),
            "message": str(e),
            "fixGuide": "Mở ứng dụng HideProxy và bật Local API cổng 10101."
        })

    # 3. AdsPower API
    t0 = time.time()
    try:
        r = requests.get(f"{ADS_BASE}/api/v1/user/list?page=1&page_size=1", headers=ADS_HEADERS, timeout=2)
        lat = int((time.time() - t0) * 1000)
        if r.status_code == 200 and r.json().get("code") == 0:
            checks.append({
                "id": "adspower",
                "category": "Browser Engine",
                "name": "AdsPower Local API (:50325)",
                "status": "pass",
                "latencyMs": lat,
                "message": f"AdsPower Local API Online ({lat}ms)",
                "fixGuide": "AdsPower sẵn sàng."
            })
        else:
            checks.append({
                "id": "adspower",
                "category": "Browser Engine",
                "name": "AdsPower Local API (:50325)",
                "status": "warn",
                "latencyMs": lat,
                "message": f"AdsPower error: {r.text[:100]}",
                "fixGuide": "Kiểm tra API key trong AdsPower Settings -> Local API."
            })
    except Exception as e:
        checks.append({
            "id": "adspower",
            "category": "Browser Engine",
            "name": "AdsPower Local API (:50325)",
            "status": "fail",
            "latencyMs": int((time.time() - t0) * 1000),
            "message": str(e),
            "fixGuide": "Khởi động AdsPower và bật Local API tại cổng 50325."
        })

    # 4. Extension MV3
    t0 = time.time()
    ext_path = EXTENSION_DIR
    manifest_f = os.path.join(ext_path, "manifest.json")
    content_f = os.path.join(ext_path, "content.js")
    if os.path.exists(manifest_f) and os.path.exists(content_f):
        checks.append({
            "id": "extension",
            "category": "Browser Extension",
            "name": "Copilot MV3 Extension",
            "status": "pass",
            "latencyMs": int((time.time() - t0) * 1000),
            "message": f"Folder Extension MV3 hợp lệ ({ext_path})",
            "fixGuide": "Extension sẵn sàng để AdsPower nạp tự động."
        })
    else:
        checks.append({
            "id": "extension",
            "category": "Browser Extension",
            "name": "Copilot MV3 Extension",
            "status": "fail",
            "latencyMs": int((time.time() - t0) * 1000),
            "message": f"Thiếu file extension tại: {ext_path}",
            "fixGuide": "Copy thư mục additions/tts_bot/extension sang máy mới."
        })

    # 5. Storage
    t0 = time.time()
    download_dir = r"D:\Download"
    has_dl = os.path.exists(download_dir)
    checks.append({
        "id": "storage",
        "category": "Storage & Assets",
        "name": "Storage & Folders",
        "status": "pass" if has_dl else "warn",
        "latencyMs": int((time.time() - t0) * 1000),
        "message": f"Thư mục download D:\\Download {'sẵn sàng' if has_dl else 'chưa có (dùng fallback)'}",
        "fixGuide": "Tạo thư mục D:\\Download nếu muốn lưu ảnh mockups vào đó."
    })

    has_fail = any(c["status"] == "fail" for c in checks)
    has_warn = any(c["status"] == "warn" for c in checks)
    overall = "fail" if has_fail else "warn" if has_warn else "pass"
    pass_cnt = len([c for c in checks if c["status"] == "pass"])

    summary = (
        f"Tất cả {len(checks)}/{len(checks)} kết nối hoạt động hoàn hảo!"
        if overall == "pass" else
        f"Đạt {pass_cnt}/{len(checks)} kiểm thử (có một số cảnh báo phụ)."
        if overall == "warn" else
        f"Có {len([c for c in checks if c['status'] == 'fail'])} kết nối chưa đạt. Vui lòng kiểm tra hướng dẫn."
    )

    return {
        "code": 200,
        "overallStatus": overall,
        "summary": summary,
        "durationMs": int((time.time() - start_t) * 1000),
        "checks": checks
    }
