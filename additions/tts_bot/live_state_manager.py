# -*- coding: utf-8 -*-
"""
Live State Manager & Real-Time Bus for Fox-Auto
Part of TTS-Bot Copilot Ecosystem.
Provides Single Source of Truth (SSOT) across Extension, Backend, Sheet, and AdsPower.
Zero-lag, strictly synchronized, eliminating stale / conflicting states.
"""

import os
import json
import time
import datetime
import threading
import requests
from typing import Dict, Any, Optional

RUNTIME_DIR = r"G:\RTTS\19-08-2026\fox-auto\additions\tts_bot\runtime"
STATE_FILE = os.path.join(RUNTIME_DIR, "live_state.json")
ARCHIVE_DIR = os.path.join(RUNTIME_DIR, "archive")
CSV_PATH = r"G:\RTTS\dotpsd\runtime\sheet_am.csv"

ADS_API_KEY = "c9ea96522fba29ee72f2fee511b77868008da729dcdcc201"
ADS_HEADERS = {"Authorization": f"Bearer {ADS_API_KEY}", "Content-Type": "application/json"}
ADS_BASE = "http://127.0.0.1:50325"

os.makedirs(RUNTIME_DIR, exist_ok=True)
os.makedirs(ARCHIVE_DIR, exist_ok=True)

class StateManager:
    _lock = threading.Lock()
    _state: Dict[str, Dict[str, Any]] = {}
    _subscribers = []

    @classmethod
    def load(cls):
        with cls._lock:
            if os.path.exists(STATE_FILE):
                try:
                    with open(STATE_FILE, "r", encoding="utf-8") as f:
                        cls._state = json.load(f)
                except Exception as e:
                    print(f"[StateManager] Error reading {STATE_FILE}: {e}")
                    cls._state = {}
            else:
                cls._state = {}

    @classmethod
    def save(cls):
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(cls._state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[StateManager] Error saving {STATE_FILE}: {e}")

    @classmethod
    def get_all(cls) -> Dict[str, Any]:
        with cls._lock:
            return dict(cls._state)

    @classmethod
    def get_profile(cls, pid: str) -> Dict[str, Any]:
        with cls._lock:
            return cls._state.get(pid, {
                "id": pid,
                "status": "IDLE",
                "sub_status": "Ready",
                "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "source": "DEFAULT",
                "watchdog": {"active": False, "countdown": 360},
                "uploads": [],
                "attempts": 1
            })

    @classmethod
    def update_profile_state(cls, pid: str, new_status: str, sub_status: str = "", source: str = "EXTENSION", extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        with cls._lock:
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur = cls._state.get(pid, {
                "id": pid,
                "status": "IDLE",
                "sub_status": "",
                "created_at": now_str,
                "uploads": [],
                "attempts": 1,
                "watchdog": {"active": False, "countdown": 360}
            })

            old_status = cur.get("status")
            cur["status"] = new_status
            if sub_status:
                cur["sub_status"] = sub_status
            cur["source"] = source
            cur["updated_at"] = now_str

            if extra:
                for k, v in extra.items():
                    if k == "watchdog":
                        cur["watchdog"] = {**cur.get("watchdog", {}), **v}
                    elif k == "uploads" and isinstance(v, list):
                        cur.setdefault("uploads", []).extend(v)
                    else:
                        cur[k] = v

            cls._state[pid] = cur
            cls.save()

        # Handle side-effects asynchronously
        threading.Thread(target=cls._handle_side_effects, args=(pid, new_status, sub_status, old_status), daemon=True).start()
        return cur

    @classmethod
    def _handle_side_effects(cls, pid: str, status: str, sub_status: str, old_status: str):
        print(f"[LiveBus] Profile [{pid}] Status Transition: {old_status} -> {status} ({sub_status})")
        
        # 1. Update CSV
        try:
            if os.path.exists(CSV_PATH):
                with open(CSV_PATH, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                updated = False
                for i in range(1, len(lines)):
                    row = lines[i].split(",")
                    if row and row[0].strip() == pid:
                        row[1] = status
                        lines[i] = ",".join(row)
                        updated = True
                        break
                if updated:
                    with open(CSV_PATH, "w", encoding="utf-8") as f:
                        f.writelines(lines)
                    print(f"[LiveBus] CSV status updated for {pid} -> {status}")
        except Exception as e:
            print(f"[LiveBus] CSV update error: {e}")

        # 2. Lethal Appeal Execution
        if "APPEAL" in status.upper() or "DEAD" in status.upper():
            print(f"[LiveBus] 🚨 LETHAL APPEAL TRIGGERED FOR {pid}! Executing termination...")
            cls._terminate_adspower_profile(pid)

    @classmethod
    def _terminate_adspower_profile(cls, pid: str):
        try:
            # Find profile in AdsPower
            r = requests.get(f"{ADS_BASE}/api/v1/user/list?page=1&page_size=100", headers=ADS_HEADERS, timeout=5).json()
            users = r.get("data", {}).get("list", [])
            target = next((u for u in users if pid in u.get("name", "")), None)
            if not target:
                print(f"[Termination] No AdsPower profile found for {pid}")
                return

            uid = target["user_id"]
            print(f"[Termination] Closing & Deleting AdsPower profile {target['name']} (UID: {uid})...")
            
            # Close browser first
            requests.get(f"{ADS_BASE}/api/v1/browser/stop?user_id={uid}", headers=ADS_HEADERS, timeout=5)
            time.sleep(1)
            
            # Delete profile
            del_res = requests.post(f"{ADS_BASE}/api/v1/user/delete", headers=ADS_HEADERS, json={"user_ids": [uid]}, timeout=5).json()
            print(f"[Termination] AdsPower deletion result: {del_res}")
        except Exception as e:
            print(f"[Termination] Error terminating AdsPower profile: {e}")

    @classmethod
    def record_upload(cls, pid: str, file_name: str, file_size: int, file_type: str, file_bytes: bytes, round_num: int = 1) -> str:
        with cls._lock:
            prof_dir = os.path.join(ARCHIVE_DIR, pid, f"round_{round_num}")
            os.makedirs(prof_dir, exist_ok=True)
            
            save_path = os.path.join(prof_dir, file_name)
            with open(save_path, "wb") as f:
                f.write(file_bytes)
                
            entry = {
                "name": file_name,
                "size": file_size,
                "type": file_type,
                "round": round_num,
                "path": save_path,
                "uploaded_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            cur = cls._state.get(pid, {})
            cur.setdefault("uploads", []).append(entry)
            cls._state[pid] = cur
            cls.save()
            print(f"[Archive] Successfully saved uploaded file: {save_path} ({file_size} bytes)")
            return save_path

StateManager.load()
