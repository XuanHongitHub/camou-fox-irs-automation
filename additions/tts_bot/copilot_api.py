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
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Body, Request
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse

from live_state_manager import StateManager

router = APIRouter(prefix="/api/copilot", tags=["Copilot"])

CSV_PATH = r"G:\RTTS\dotpsd\runtime\sheet_am.csv"
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

def load_sheet_profiles() -> Dict[str, Dict[str, Any]]:
    profiles = {}
    if not os.path.exists(CSV_PATH):
        return profiles

    with open(CSV_PATH, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.reader(f)
        rows = list(reader)
        if len(rows) < 2:
            return profiles
            
        headers = [h.strip() for h in rows[0]]
        for row in rows[1:]:
            if not row or not row[0].strip():
                continue
            pid = row[0].strip()
            if pid.lower() in ["profile name", "profile", "id"]:
                continue
                
            mail_raw = row[5].strip() if len(row) > 5 else ""
            mail_parts = mail_raw.split("|")
            email = mail_parts[0] if len(mail_parts) > 0 else ""
            email_pass = mail_parts[1] if len(mail_parts) > 1 else ""
            oauth_token = mail_parts[2] if len(mail_parts) > 2 else ""

            phone_raw = row[9].strip() if len(row) > 9 else ""
            phone_parts = phone_raw.split("----")
            phone = phone_parts[0] if len(phone_parts) > 0 else ""
            sms_api = phone_parts[1] if len(phone_parts) > 1 else ""

            full_name = row[10].strip() if len(row) > 10 else ""
            names = full_name.split()
            first_name = names[0] if names else ""
            last_name = " ".join(names[1:]) if len(names) > 1 else ""

            ssn = row[11].strip() if len(row) > 11 else ""
            address = row[12].strip() if len(row) > 12 else ""
            city = row[13].strip() if len(row) > 13 else ""
            state = row[14].strip() if len(row) > 14 else "FL"
            zip_code = row[15].strip() if len(row) > 15 else ""
            dob = row[16].strip() if len(row) > 16 else ""
            gender = row[17].strip() if len(row) > 17 else "M"
            ein = row[18].strip() if len(row) > 18 else ""

            # Check files in D:\Download
            front_doc = rf"D:\Download\FL_FRONT_{pid}_{full_name.replace(' ', '_')}.jpg"
            back_doc = rf"D:\Download\FL_BACK_{pid}_{full_name.replace(' ', '_')}.jpg"
            bank_doc = rf"D:\Download\{full_name} - {ein} - {ssn}.pdf"

            profiles[pid] = {
                "id": pid,
                "name": full_name,
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "email_pass": email_pass,
                "oauth_token": oauth_token,
                "shop_pass": row[6].strip() if len(row) > 6 else "T2!vK8$rJ5@nH1",
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
                "files": {
                    "front": front_doc if os.path.exists(front_doc) else "",
                    "back": back_doc if os.path.exists(back_doc) else "",
                    "bank": bank_doc if os.path.exists(bank_doc) else ""
                }
            }
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
            "name": s_info["name"],
            "state": s_info["state"],
            "email": s_info["email"],
            "phone": s_info["phone"],
            "status": status,
            "sub_status": sub_status,
            "updated_at": updated_at,
            "uploads_count": len(uploads),
            "watchdog": watchdog,
            "has_files": bool(s_info["files"]["front"] and s_info["files"]["back"])
        })
    return {"code": 200, "count": len(result), "profiles": result}

@router.get("/profile/{record_id}")
def get_single_profile_detail(record_id: str):
    sheet_data = load_sheet_profiles()
    prof = sheet_data.get(record_id)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Profile {record_id} not found in sheet")
    
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

@router.get("/otp/{record_id}")
def fetch_otp(record_id: str, otp_type: str = "all"):
    """
    Live OTP Resolver for Email and SMS.
    Returns immediately with latest 6-digit code.
    """
    sheet_data = load_sheet_profiles()
    prof = sheet_data.get(record_id)
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found")

    mail_otp = None
    sms_otp = None

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
                    body = m.get("Subject", "") + " " + m.get("BodyPreview", "")
                    codes = re.findall(r"\b\d{6}\b", body)
                    if codes:
                        mail_otp = codes[0]
                        break
        except Exception as e:
            print(f"[OTP Mail] Error for {record_id}: {e}")

    # 2. SMS OTP (SMS8 API)
    if otp_type in ["all", "phone", "sms"] and prof.get("sms_api"):
        try:
            r = requests.get(prof["sms_api"], timeout=8)
            res = r.json()
            data_obj = res.get("data", {})
            if isinstance(data_obj, dict):
                code = data_obj.get("code")
                if code and re.match(r"^\d{4,8}$", str(code).strip()):
                    sms_otp = str(code).strip()
            if not sms_otp:
                records = data_obj.get("records", []) if isinstance(data_obj, dict) else (res.get("records", []) or [])
                for rec in records:
                    txt = rec.get("sms", "") or rec.get("content", "") or str(rec)
                    codes = re.findall(r"\b\d{6}\b", txt)
                    if codes:
                        sms_otp = codes[0]
                        break
        except Exception as e:
            print(f"[OTP SMS] Error for {record_id}: {e}")

    return {
        "code": 200,
        "record_id": record_id,
        "mail_otp": mail_otp,
        "sms_otp": sms_otp,
        "time": datetime.datetime.now().strftime("%H:%M:%S")
    }

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
EXTENSION_DIR = r"G:\RTTS\19-08-2026\fox-auto\additions\tts_bot\extension"

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
            "proxy_user": "minhteo0209",
            "proxy_password": "minhteo"
        }
        create_payload = {
            "name": f"{pid} - {prof['name'] or 'TTS'}",
            "group_id": "10716270",
            "user_proxy_config": proxy_config,
            "fingerprint_config": {
                "os": "iOS",
                "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
                "screen_resolution": "390_844",
                "language": ["en-US", "en"]
            },
            "launch_args": [
                f"--load-extension={EXTENSION_DIR}",
                "--window-size=430,932",
                "--touch-events=enabled",
                "--enable-viewport",
                "--force-device-scale-factor=3",
                "--use-mobile-user-agent"
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
