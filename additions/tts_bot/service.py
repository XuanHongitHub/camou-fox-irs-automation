# -*- coding: utf-8 -*-
"""
TTS-Bot Service for Fox-Auto
FastAPI HTTP Backend running on port 8787.
Connects Sheet, AdsPower, HideProxy, Image Studio (Crop/Exif), and Sole Prop Runner.
"""

import sys
import os
import time
import datetime
import json
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
import uvicorn
import requests

from exif_engine import inject_iphone_exif, IPHONE_PRESETS
from crop_filter import crop_cr80_and_filter

if r"G:\RTTS\dotpsd" not in sys.path:
    sys.path.insert(0, r"G:\RTTS\dotpsd")

sys.stdout.reconfigure(encoding='utf-8')

app = FastAPI(title="TTS-Bot Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ADS_API_KEY = "c9ea96522fba29ee72f2fee511b77868008da729dcdcc201"
ADS_HEADERS = {"Authorization": f"Bearer {ADS_API_KEY}"}
ADS_BASE = "http://127.0.0.1:50325"
HIDEPROXY_BASE = "http://127.0.0.1:10101"
SHEET_ID = "1wAh6we1CsSuPVbCOD5vRyO3KJqNKBbcdq7LBZVlI268"
INBOX_DIR = r"G:\RTTS\dotpsd\inbox_submits"
DOWNLOAD_DIR = r"D:\Download"
RUNTIME_DIR = r"F:\herd\fox-auto\additions\tts_bot\runtime"

os.makedirs(INBOX_DIR, exist_ok=True)
os.makedirs(RUNTIME_DIR, exist_ok=True)

# In-memory storage for assigned photo slots and running jobs
ASSIGNED_PHOTOS: Dict[str, Dict[str, Any]] = {}
RUN_STATUSES: Dict[str, Dict[str, Any]] = {}

def get_sheet_token():
    try:
        user_path = r"G:\RTTS\19-08-2026\fox-auto\private\google-drive\oauth-user.json"
        web_path = r"G:\RTTS\19-08-2026\fox-auto\private\google-drive\oauth-web-client.json"
        if not os.path.exists(user_path) or not os.path.exists(web_path):
            return None
        with open(user_path, "r", encoding="utf-8") as f: u = json.load(f)
        with open(web_path, "r", encoding="utf-8") as f: w = json.load(f)
        web = w.get("web") or w.get("installed") or {}
        r = requests.post("https://oauth2.googleapis.com/token", data={
            "client_id": web["client_id"],
            "client_secret": web["client_secret"],
            "refresh_token": u["refresh_token"],
            "grant_type": "refresh_token"
        }, timeout=8)
        return r.json().get("access_token")
    except Exception:
        return None

# ==============================================================================
# STATUS & HEALTH
# ==============================================================================
@app.get("/api/status")
def get_service_status():
    adspower_online = False
    try:
        r = requests.get(f"{ADS_BASE}/api/v1/user/list?page=1&page_size=1", headers=ADS_HEADERS, timeout=2).json()
        adspower_online = (r.get("code") == 0)
    except Exception:
        pass

    hideproxy_online = False
    try:
        r = requests.get(f"{HIDEPROXY_BASE}/api/filter/country", timeout=2).json()
        hideproxy_online = (r.get("code") == 200)
    except Exception:
        pass

    return {
        "status": "online",
        "adspower": {"online": adspower_online, "url": ADS_BASE},
        "hideproxy": {"online": hideproxy_online, "url": HIDEPROXY_BASE},
        "presets": list(IPHONE_PRESETS.keys()),
        "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

# ==============================================================================
# GOOGLE SHEET RECORDS
# ==============================================================================
@app.get("/api/records")
def get_records(tab: str = "Automation"):
    import csv, io
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={tab}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8")
            reader = list(csv.reader(io.StringIO(content)))
            headers = [h.strip() for h in reader[0]]
            records = []
            
            for idx, row in enumerate(reader[1:]):
                if not row or not row[0].strip(): continue
                rec_id = row[0].strip()
                if rec_id.lower() in ['profile', 'profile name', 'id', 'stt']: continue
                
                # Extract relevant fields safely
                d = {
                    "id": rec_id,
                    "row_index": idx + 2,
                    "tab": tab,
                    "name": row[10].strip() if len(row) > 10 and row[10].strip() else (row[1].strip() if len(row) > 1 else ""),
                    "status": row[1].strip() if len(row) > 1 else "",
                    "mail": row[5].split('|')[0].strip() if len(row) > 5 and '|' in row[5] else (row[5].strip() if len(row) > 5 else ""),
                    "phone": row[9].strip() if len(row) > 9 else "",
                    "ssn": row[11].strip() if len(row) > 11 else "",
                    "address": row[12].strip() if len(row) > 12 else "",
                    "city": row[13].strip() if len(row) > 13 else "",
                    "state": row[14].strip() if len(row) > 14 else "FL",
                    "zip": row[15].strip() if len(row) > 15 else "",
                    "dob": row[16].strip() if len(row) > 16 else "",
                    "ein": row[18].strip() if len(row) > 18 else "",
                    "business_name": row[19].strip() if len(row) > 19 and row[19].strip() else (row[10].strip() if len(row) > 10 else ""),
                    "assigned_photos": ASSIGNED_PHOTOS.get(rec_id, {"front": [], "back": []})
                }
                
                # Check completeness
                has_imgs = bool(d["assigned_photos"].get("front") and d["assigned_photos"].get("back"))
                d["has_photos"] = has_imgs
                d["is_ready"] = bool(d["ssn"] and d["name"] and has_imgs)
                records.append(d)
                
            return {"code": 200, "tab": tab, "count": len(records), "records": records}
    except Exception as e:
        return {"code": 500, "error": str(e)}

# ==============================================================================
# PHOTO INBOX & STUDIO
# ==============================================================================
@app.get("/api/inbox/list")
def list_inbox_files():
    files = []
    # Scan inbox_submits
    if os.path.exists(INBOX_DIR):
        for f in os.listdir(INBOX_DIR):
            fp = os.path.join(INBOX_DIR, f)
            if os.path.isfile(fp) and f.lower().endswith(('.jpg', '.jpeg', '.png')):
                files.append({
                    "name": f,
                    "path": fp,
                    "size": os.path.getsize(fp),
                    "modified": time.ctime(os.path.getmtime(fp)),
                    "source": "inbox_submits"
                })
    # Scan D:\Download for recent photos
    if os.path.exists(DOWNLOAD_DIR):
        recent_dl = []
        for f in os.listdir(DOWNLOAD_DIR):
            if f.lower().endswith(('.jpg', '.jpeg', '.png')) and any(k in f.lower() for k in ['img_', 'bcn', 'fl_', 'am-']):
                fp = os.path.join(DOWNLOAD_DIR, f)
                try:
                    mtime = os.path.getmtime(fp)
                    recent_dl.append((mtime, f, fp, os.path.getsize(fp)))
                except Exception:
                    pass
        recent_dl.sort(reverse=True)
        for mtime, f, fp, sz in recent_dl[:40]:
            files.append({
                "name": f,
                "path": fp,
                "size": sz,
                "modified": time.ctime(mtime),
                "source": "downloads"
            })
            
    return {"code": 200, "count": len(files), "files": files}

@app.post("/api/assign")
def assign_photos(payload: Dict[str, Any] = Body(...)):
    rec_id = payload.get("record_id")
    front_paths = payload.get("front_paths", [])
    back_paths = payload.get("back_paths", [])
    
    if not rec_id:
        raise HTTPException(status_code=400, detail="Missing record_id")
        
    ASSIGNED_PHOTOS[rec_id] = {
        "front": front_paths if isinstance(front_paths, list) else [front_paths],
        "back": back_paths if isinstance(back_paths, list) else [back_paths],
        "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    return {"code": 200, "record_id": rec_id, "assigned": ASSIGNED_PHOTOS[rec_id]}

@app.post("/api/process_photo")
def process_photo(payload: Dict[str, Any] = Body(...)):
    """
    Executes Auto-Crop (CR80), Filter enhancement, and Apple iPhone EXIF injection.
    """
    input_path = payload.get("input_path")
    record_id = payload.get("record_id", "TEMP")
    side = payload.get("side", "FRONT").upper()
    preset = payload.get("preset", "iPhone 14 Pro")
    auto_crop = payload.get("auto_crop", True)
    
    if not input_path or not os.path.exists(input_path):
        raise HTTPException(status_code=400, detail=f"File not found: {input_path}")
        
    base_name = f"{record_id}_{side}_processed_{int(time.time())}.jpg"
    temp_cropped = os.path.join(RUNTIME_DIR, f"crop_{base_name}")
    final_output = os.path.join(RUNTIME_DIR, base_name)
    
    # 1. Crop & Filter
    if auto_crop:
        crop_cr80_and_filter(input_path, temp_cropped, enhance=True)
        to_exif = temp_cropped
    else:
        to_exif = input_path
        
    # 2. Inject EXIF
    exif_res = inject_iphone_exif(to_exif, final_output, preset_name=preset)
    
    # Clean temporary crop
    if os.path.exists(temp_cropped) and temp_cropped != final_output:
        try: os.remove(temp_cropped)
        except Exception: pass
        
    return {
        "code": 200,
        "input_path": input_path,
        "output_path": final_output,
        "exif_metadata": exif_res
    }

# ==============================================================================
# HIDEPROXY INTEGRATION
# ==============================================================================
@app.get("/api/hideproxy/states")
def get_hideproxy_states():
    try:
        r = requests.get(f"{HIDEPROXY_BASE}/api/filter/state?country=US", timeout=4).json()
        return r
    except Exception as e:
        return {"code": 500, "error": str(e)}

@app.get("/api/hideproxy/ports")
def get_hideproxy_ports():
    try:
        r = requests.get(f"{HIDEPROXY_BASE}/api/port/status?port=ALL", timeout=4).json()
        return r
    except Exception as e:
        return {"code": 500, "error": str(e)}

@app.post("/api/hideproxy/buy")
def buy_proxy_safe(payload: Dict[str, Any] = Body(...)):
    """
    Buys EXACTLY 1 proxy safely for specified state/city and start port.
    Prevents mass point deduction.
    """
    state = payload.get("state", "florida").lower()
    city = payload.get("city", "")
    port = payload.get("port", 50001)
    
    query = f"country=US&quantity=1&startPort={port}&state={state}"
    if city:
        query += f"&city={city}"
        
    url = f"{HIDEPROXY_BASE}/api/proxy/buy?{query}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read().decode("utf-8")
            return {"code": 200, "url": url, "result": json.loads(data) if data else "OK"}
    except Exception as e:
        return {"code": 500, "error": str(e), "url": url}

# ==============================================================================
# SOLE PROPRIETORSHIP SUBMISSION RUNNER
# ==============================================================================
@app.post("/api/run")
def execute_run(payload: Dict[str, Any] = Body(...)):
    rec_id = payload.get("record_id")
    dry_run = payload.get("dry_run", False)
    
    if not rec_id:
        raise HTTPException(status_code=400, detail="Missing record_id")
        
    assigned = ASSIGNED_PHOTOS.get(rec_id, {})
    front_photos = assigned.get("front", [])
    back_photos = assigned.get("back", [])
    
    # Preflight Check
    if not front_photos or not back_photos:
        return {
            "code": 400,
            "status": "PENDING_PHOTOS",
            "message": f"Hồ sơ {rec_id} chưa được gán đủ ảnh mặt trước và mặt sau! Vui lòng chọn ảnh trong Studio trước khi chạy."
        }
        
    front_img = front_photos[0]
    back_img = back_photos[0]
    
    if dry_run:
        return {
            "code": 200,
            "status": "PREFLIGHT_PASSED",
            "record_id": rec_id,
            "front": front_img,
            "back": back_img,
            "message": f"Preflight kiểm tra hoàn tất! Sẵn sàng nộp Sole Prop cho {rec_id}."
        }
        
    # Mark running
    RUN_STATUSES[rec_id] = {
        "status": "running",
        "started_at": datetime.datetime.now().strftime("%H:%M:%S"),
        "step": "Starting profile"
    }
    
    # Launch execution in background thread or process
    import threading
    def worker():
        try:
            from unified_flow_manager import AdsPowerManager, SubmissionExecutor
            all_profs = AdsPowerManager.get_all_profiles()
            prof = AdsPowerManager.find_active_profile(rec_id, all_profs)
            if not prof:
                RUN_STATUSES[rec_id] = {"status": "failed", "error": "Profile not found in AdsPower"}
                return
                
            RUN_STATUSES[rec_id]["step"] = "Executing Sole Prop Verification"
            # Execute submission flow
            rec_dummy = {
                "record_id": rec_id,
                "name": payload.get("name", rec_id),
                "tab": payload.get("tab", "Automation"),
                "row_index": payload.get("row_index", 2)
            }
            res = SubmissionExecutor.execute(rec_dummy, prof, front_img, back_img, os.path.join(RUNTIME_DIR, "archive"))
            if res:
                RUN_STATUSES[rec_id] = {"status": "done", "finished_at": datetime.datetime.now().strftime("%H:%M:%S")}
            else:
                RUN_STATUSES[rec_id] = {"status": "failed", "error": "Submission execution failed"}
        except Exception as e:
            RUN_STATUSES[rec_id] = {"status": "failed", "error": str(e)}
            
    threading.Thread(target=worker, daemon=True).start()
    return {"code": 200, "status": "started", "record_id": rec_id}

@app.get("/api/run/status/{record_id}")
def get_run_status(record_id: str):
    return RUN_STATUSES.get(record_id, {"status": "idle"})

# ==============================================================================
# COPILOT REAL-TIME BUS & DASHBOARD
# ==============================================================================
from copilot_api import router as copilot_router
app.include_router(copilot_router)

@app.get("/copilot", response_class=HTMLResponse)
def serve_copilot_dashboard():
    dash_path = os.path.join(os.path.dirname(__file__), "copilot_dashboard.html")
    if os.path.exists(dash_path):
        with open(dash_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h3>Copilot dashboard not found</h3>", status_code=404)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8787, log_level="info")
