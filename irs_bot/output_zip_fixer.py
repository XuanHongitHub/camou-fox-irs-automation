"""
Output ZIP Code Fixer & Synchronizer
Scans outputs/results.csv, queue.db, and corresponding PDF notices to detect and
surgically fix incorrect/PO Box ZIP codes in-place, preserving IRS PDF417 barcodes 100%.
"""

from __future__ import annotations

import csv
import json
import logging
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

try:
    import pymupdf  # PyMuPDF
except ImportError:
    try:
        import fitz as pymupdf
    except ImportError:
        pymupdf = None

from .runner import (
    DISALLOWED_STREET_ZIPS,
    USPS_EXPANSIONS,
    USPS_REGEX_REPLACEMENTS,
    _collapse_spaces,
    _digits,
    _get,
    _load_postal_database,
    _sanitize_city,
    auto_fix_record_postal,
)
from .storage import RESULT_HEADERS, _sync_styled_xlsx

logger = logging.getLogger("irs_bot.zip_fixer")


def fix_pdf_zip_in_file(pdf_path: Path, old_zip: str, new_zip: str) -> Optional[bytes]:
    """
    Surgically replaces old_zip with new_zip in the IRS CP 575 notice PDF address block (y: 140..220).
    Keeps the PDF417 barcode at top right (y < 70) 100% untouched.
    Returns bytes of the modified PDF, or None if unchanged/failed.
    """
    if pymupdf is None:
        logger.warning("pymupdf not installed; skipping PDF edit for %s", pdf_path)
        return None

    raw_old = re.sub(r"\D", "", str(old_zip or "")).strip()
    raw_new = re.sub(r"\D", "", str(new_zip or "")).strip().zfill(5)

    if not raw_old or not raw_new or raw_old == raw_new:
        return None

    if not pdf_path.exists() or pdf_path.stat().st_size == 0:
        return None

    try:
        pdf_bytes = pdf_path.read_bytes()
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        if len(doc) == 0:
            return None
        page = doc[0]

        # Locate address spans (y: 140..220)
        # Method 1 (Best & 100% Native): Direct in-place content stream replacement.
        # Preserves 100% natural reading order, identical byte layout, and prevents text selection jump.
        stream_changed = False
        for xref in page.get_contents():
            stream_bytes = doc.xref_stream(xref)
            text = stream_bytes.decode('latin1', errors='ignore')
            if raw_old in text:
                # Target '(CITY, ST OLD_ZIP) Tj' pattern in IRS notice stream
                pattern = re.compile(r'(\([^\)]*?)' + re.escape(raw_old) + r'([^\)]*\)\s*Tj)')
                new_text = pattern.sub(r'\g<1>' + raw_new + r'\g<2>', text)
                if new_text != text:
                    doc.update_stream(xref, new_text.encode('latin1'))
                    stream_changed = True
            else:
                # Regex fallback for (CITY, ST 12345) Tj
                m = re.search(r'(\([A-Za-z\s.-]+,\s*[A-Za-z]{2}\s+)\d{5}(\)\s*Tj)', text)
                if m:
                    new_text = text[:m.start()] + m.group(1) + raw_new + m.group(2) + text[m.end():]
                    doc.update_stream(xref, new_text.encode('latin1'))
                    stream_changed = True

        if stream_changed:
            res_bytes = doc.tobytes()
            pdf_path.write_bytes(res_bytes)
            return res_bytes

        # Method 2: Fallback visual span replacement
        dict_data = page.get_text("dict")
        spans = [
            s
            for b in dict_data.get("blocks", [])
            if b.get("type") == 0
            for l in b.get("lines", [])
            for s in l.get("spans", [])
        ]
        target_span = None
        for s in spans:
            if raw_old in s.get("text", "") and 140 < s.get("bbox", [0, 0, 0, 0])[1] < 220:
                target_span = s
                break

        rects = page.search_for(raw_old)
        matching_rects = [r for r in rects if 140 < r.y0 < 220]
        if not matching_rects and len(raw_old) == 5 and raw_old.startswith("0"):
            short_old = raw_old[1:]
            rects = page.search_for(short_old)
            matching_rects = [r for r in rects if 140 < r.y0 < 220]

        if not matching_rects:
            return None

        rect = matching_rects[0]
        baseline_y = target_span["origin"][1] if target_span else (rect.y1 - 2.5)
        font_size = target_span["size"] if target_span else 9.0

        # Safe redact: +2.2pt to avoid touching line above
        safe_rect = pymupdf.Rect(rect.x0, rect.y0 + 2.2, rect.x1, rect.y1)
        page.add_redact_annot(safe_rect, fill=(1, 1, 1))
        page.apply_redactions()

        # Insert new ZIP in native Helvetica 9pt
        page.insert_text(
            pymupdf.Point(rect.x0, baseline_y),
            raw_new,
            fontname="helv",
            fontsize=font_size,
            color=(0, 0, 0),
        )

        res_bytes = doc.tobytes()
        pdf_path.write_bytes(res_bytes)
        return res_bytes
    except Exception as exc:
        logger.error("Error fixing PDF %s: %s", pdf_path, exc)
        return None


def parse_location_from_pdf(pdf_path: Path) -> Optional[Tuple[str, str, str]]:
    """
    Extracts (city, state, zip) from the address block of the IRS notice PDF
    by reconstructing visual text lines from text spans.
    """
    if pymupdf is None or not pdf_path.exists() or pdf_path.stat().st_size == 0:
        return None

    try:
        doc = pymupdf.open(str(pdf_path))
        if len(doc) == 0:
            return None
        page = doc[0]
        dict_data = page.get_text("dict")
        spans = [
            s
            for b in dict_data.get("blocks", [])
            if b.get("type") == 0
            for l in b.get("lines", [])
            for s in l.get("spans", [])
        ]
        # Filter spans in address block (y: 130..220)
        addr_spans = [s for s in spans if 130 < s.get("bbox", [0, 0, 0, 0])[1] < 220]
        # Group spans by line bucket (round to 4pt)
        lines_by_y: Dict[int, List[Dict[str, Any]]] = {}
        for s in addr_spans:
            bucket = int(round(s["bbox"][1] / 4.0)) * 4
            lines_by_y.setdefault(bucket, []).append(s)

        for bucket in sorted(lines_by_y.keys()):
            line_spans = sorted(lines_by_y[bucket], key=lambda s: s["bbox"][0])
            line_text = " ".join(s.get("text", "").strip() for s in line_spans if s.get("text", "").strip())
            line_text = re.sub(r"\s+", " ", line_text).strip()

            # Look for CITY, STATE ZIP or CITY ST ZIP
            m = re.search(r"([A-Za-z\s.-]+),\s*([A-Za-z]{2})\s+(\d{5})", line_text)
            if m:
                city = m.group(1).strip()
                state = m.group(2).strip().upper()
                zip_code = m.group(3).strip()
                return city, state, zip_code
            m2 = re.search(r"([A-Za-z\s.-]{2,})\s+([A-Za-z]{2})\s+(\d{5})", line_text)
            if m2:
                city = m2.group(1).strip()
                state = m2.group(2).strip().upper()
                zip_code = m2.group(3).strip()
                return city, state, zip_code
    except Exception as exc:
        logger.debug("Could not parse location from PDF %s: %s", pdf_path, exc)
    return None


def load_queue_db_map(queue_db_path: Path) -> Dict[str, Dict[str, str]]:
    """
    Reads queue.db to extract original input row data (city, state, zip) keyed by
    both 'batch_id:record_id' and 'record_id'.
    """
    out: Dict[str, Dict[str, str]] = {}
    if not queue_db_path.exists():
        return out

    try:
        conn = sqlite3.connect(str(queue_db_path))
        cur = conn.cursor()
        cur.execute("SELECT job_id, payload FROM jobs")
        for job_id, payload_str in cur.fetchall():
            try:
                p = json.loads(payload_str)
                rec = p.get("record") or {}
                batch_id = p.get("batch_id") or ""
                rec_id = str(rec.get("record_id") or "").strip()
                city = str(rec.get("CITI") or rec.get("city") or "").strip()
                state = str(rec.get("BANG") or rec.get("state") or "").strip()
                zip_code = str(rec.get("ZIP") or rec.get("zip") or "").strip()
                county = str(rec.get("county") or "").strip()
                item = {
                    "city": city,
                    "state": state,
                    "zip": zip_code,
                    "county": county,
                }
                if job_id:
                    out[str(job_id).strip()] = item
                if batch_id and rec_id:
                    out[f"{batch_id}:{rec_id}"] = item
                    out[f"{batch_id}::{rec_id}"] = item
                if rec_id:
                    out[rec_id] = item
            except Exception:
                continue
        conn.close()
    except Exception as exc:
        logger.warning("Could not read queue.db: %s", exc)

    return out


def validate_and_fix_queue_jobs(
    storage_root: Path,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """
    Auto-validates and corrects postal ZIP and county for ALL jobs in queue.db
    across all statuses (pending, running, failed, done, manual_required).
    """
    queue_db_path = storage_root / "state" / "queue.db"
    if not queue_db_path.exists():
        return {"scanned": 0, "fixed": 0, "by_status": {}}

    try:
        from .runner import auto_fix_record_postal
    except Exception:
        return {"scanned": 0, "fixed": 0, "by_status": {}}

    conn = sqlite3.connect(str(queue_db_path))
    cur = conn.cursor()
    cur.execute("SELECT job_id, status, payload FROM jobs")
    rows = cur.fetchall()

    scanned = len(rows)
    fixed = 0
    by_status: Dict[str, int] = {}

    if progress_cb and scanned > 0:
        progress_cb({
            "type": "progress",
            "message": f"🔍 Đang Auto Validate {scanned} jobs trong hàng đợi (queue.db)...",
        })

    for job_id, status, payload_str in rows:
        by_status.setdefault(status, 0)
        try:
            p = json.loads(payload_str)
            rec = p.get("record")
            if not isinstance(rec, dict):
                continue

            old_z = str(rec.get("ZIP") or rec.get("zip") or "").strip()
            old_cnt = str(rec.get("county") or "").strip()

            changed = auto_fix_record_postal(rec)

            new_z = str(rec.get("ZIP") or rec.get("zip") or "").strip()
            new_cnt = str(rec.get("county") or "").strip()

            if changed or (old_z != new_z) or (old_cnt != new_cnt):
                fixed += 1
                by_status[status] = by_status.get(status, 0) + 1
                cur.execute(
                    "UPDATE jobs SET payload = ?, updated_at = ? WHERE job_id = ?",
                    (json.dumps(p, ensure_ascii=False), time.time(), job_id),
                )
        except Exception:
            continue

    if fixed > 0:
        conn.commit()
    conn.close()

    if progress_cb and scanned > 0:
        progress_cb({
            "type": "progress",
            "message": f"✅ Đã chuẩn hóa hàng đợi: {scanned} jobs (đã sửa {fixed} jobs: pending={by_status.get('pending', 0)}, failed={by_status.get('failed', 0)}, done={by_status.get('done', 0)}).",
        })

    return {"scanned": scanned, "fixed": fixed, "by_status": by_status}


def scan_and_fix_outputs(
    storage_root: Path,
    scope: str = "all",
    target_keys: Optional[List[str]] = None,
    fix_pdfs: bool = True,
    fix_csv: bool = True,
    sync_drive: bool = True,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """
    Main background scanning and fixing function (Auto Validate).
    Validates and corrects:
    1. All jobs in queue.db (pending, running, failed, done).
    2. Output results (results.csv & results.xlsx).
    3. Notice PDFs in artifacts/.
    4. Google Drive uploaded PDFs (via in-place update) if configured.
    """
    # 1. Validate & fix queue.db first
    queue_stats = validate_and_fix_queue_jobs(storage_root, progress_cb)

    csv_path = storage_root / "outputs" / "results.csv"
    if not csv_path.exists():
        return {
            "ok": True,
            "scanned": 0,
            "matched": 0,
            "fixed_records": 0,
            "fixed_pdfs": 0,
            "synced_drive": 0,
            "fixed_queue_jobs": queue_stats.get("fixed", 0),
            "scanned_queue_jobs": queue_stats.get("scanned", 0),
            "details": [],
            "message": f"Hoàn tất Auto Validate hàng đợi ({queue_stats.get('fixed', 0)}/{queue_stats.get('scanned', 0)} jobs đã sửa). Không tìm thấy file outputs/results.csv.",
        }

    # Load queue lookup map if available
    queue_db_path = storage_root / "state" / "queue.db"
    queue_map = load_queue_db_map(queue_db_path)

    # Read results.csv
    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)

    # Load Google Drive auto-push state and session if available
    drive_map: Dict[str, str] = {}
    drive_state_path = storage_root / "outputs" / "export_state" / "google-drive-auto-v1.json"
    if drive_state_path.exists():
        try:
            d_state = json.loads(drive_state_path.read_text("utf-8"))
            drive_map = d_state.get("pdf_url_by_batch_record", {})
        except Exception as exc:
            logger.warning("Could not read google-drive-auto-v1.json: %s", exc)

    drive_session = None
    if sync_drive:
        drive_candidates = [
            (storage_root / "google-drive" / "oauth-web-client.json", storage_root / "google-drive" / "oauth-user.json"),
            (Path(r"F:\Herd\fox-auto\private\google-drive\oauth-web-client.json"), Path(r"F:\Herd\fox-auto\private\google-drive\oauth-user.json")),
        ]
        for client_p, user_p in drive_candidates:
            if client_p.exists() and user_p.exists():
                try:
                    import sys
                    scripts_dir = str(Path(r"F:\Herd\fox-auto\scripts"))
                    if scripts_dir not in sys.path:
                        sys.path.insert(0, scripts_dir)
                    from drive_pdf_zip_updater import GoogleDriveSession
                    drive_session = GoogleDriveSession(str(client_p), str(user_p))
                    if progress_cb:
                        progress_cb({"type": "log", "message": "🔗 Đã kết nối Google Drive Session để đồng bộ file trực tiếp."})
                    break
                except Exception as exc:
                    logger.warning("GoogleDriveSession initialization failed: %s", exc)

    now = datetime.now()
    today_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
    target_key_set = set(target_keys or [])

    def row_matches_scope(r: Dict[str, Any]) -> bool:
        bid = str(r.get("batch_id") or "").strip()
        rid = str(r.get("record_id") or "").strip()
        k1 = f"{bid}:{rid}"
        k2 = f"{bid}::{rid}"

        if target_key_set:
            return (k1 in target_key_set) or (k2 in target_key_set) or (rid in target_key_set)

        if scope == "all":
            return True

        completed_at_str = str(r.get("ended_at") or r.get("completed_at") or "").strip()
        if not completed_at_str:
            return False

        try:
            c_dt = datetime.fromisoformat(completed_at_str.replace("Z", "+00:00")).astimezone()
            c_local = c_dt.replace(tzinfo=None)
            if scope in ("today", "tonight"):
                return c_local >= today_dt
        except Exception:
            return False

        return True

    matched_indices: List[int] = []
    for idx, r in enumerate(all_rows):
        status = str(r.get("status") or "").strip().lower()
        if status not in {"success", "done", "confirmed"}:
            continue
        if row_matches_scope(r):
            matched_indices.append(idx)

    total_matched = len(matched_indices)
    if progress_cb:
        progress_cb({
            "type": "start",
            "total": total_matched,
            "scanned": len(all_rows),
            "message": f"Bắt đầu Auto Validate {total_matched} hồ sơ kết quả (phạm vi: '{scope}')...",
        })

    fixed_records = 0
    fixed_pdfs = 0
    synced_drive = 0
    details: List[Dict[str, Any]] = []

    def resolve_path_candidate(p_str: str) -> Optional[Path]:
        if not p_str:
            return None
        p = Path(p_str)
        if p.is_absolute() and p.exists():
            return p
        p_rel = storage_root / p
        if p_rel.exists():
            return p_rel
        return p_rel

    for count, idx in enumerate(matched_indices, 1):
        row = all_rows[idx]
        bid = str(row.get("batch_id") or "").strip()
        rid = str(row.get("record_id") or "").strip()
        rec_name = str(row.get("record_name") or row.get("step6_legal_name") or "")
        k1 = f"{bid}:{rid}"
        k2 = f"{bid}::{rid}"

        # Resolve paths
        p_pdf = resolve_path_candidate(str(row.get("pdf_path") or "").strip())
        p_final = resolve_path_candidate(str(row.get("final_pdf_path") or "").strip())
        p_art = resolve_path_candidate(str(row.get("artifact_dir") or "").strip())

        # Collect all candidate PDF files on disk
        candidates: List[Path] = []
        for p_cand in (p_final, p_pdf):
            if p_cand and p_cand.exists() and p_cand.is_file() and p_cand not in candidates:
                candidates.append(p_cand)

        if p_art and p_art.exists() and p_art.is_dir():
            for f in p_art.rglob("*.pdf"):
                if f not in candidates:
                    candidates.append(f)

        for p_cand in (p_final, p_pdf):
            if p_cand and p_cand.parent.exists():
                for f in p_cand.parent.glob("*.pdf"):
                    if f not in candidates:
                        candidates.append(f)

        # Resolve location: priority queue.db -> PDF parse -> CSV
        queue_info = queue_map.get(k1) or queue_map.get(k2) or queue_map.get(rid) or {}
        city = queue_info.get("city") or ""
        state = queue_info.get("state") or ""
        current_zip = queue_info.get("zip") or ""

        pdf_extracted = None
        if not (city and state and current_zip):
            for candidate in candidates:
                pdf_extracted = parse_location_from_pdf(candidate)
                if pdf_extracted:
                    break
            if pdf_extracted:
                city = city or pdf_extracted[0]
                state = state or pdf_extracted[1]
                current_zip = current_zip or pdf_extracted[2]

        if not state:
            state = str(row.get("step6_state") or "").strip()

        # Run auto_fix_record_postal logic
        test_rec = {
            "city": city,
            "state": state,
            "zip": current_zip,
            "county": str(row.get("step6_county") or ""),
        }
        was_fixed = auto_fix_record_postal(test_rec)

        pdf_modified = False
        drive_updated = False
        old_zip = current_zip
        new_zip = test_rec["zip"]
        new_county = test_rec.get("county") or row.get("step6_county")

        if was_fixed and test_rec["zip"] != current_zip:
            patched_bytes: Optional[bytes] = None
            if fix_pdfs:
                for candidate in candidates:
                    res_bytes = fix_pdf_zip_in_file(candidate, old_zip, new_zip)
                    if res_bytes:
                        pdf_modified = True
                        patched_bytes = res_bytes

            if pdf_modified:
                fixed_pdfs += 1

            # Sync to Google Drive if applicable
            if drive_session and patched_bytes:
                drive_url = drive_map.get(k1) or drive_map.get(k2) or drive_map.get(rid) or ""
                fid = None
                m1 = re.search(r'/file/d/([a-zA-Z0-9_-]+)', drive_url)
                if m1:
                    fid = m1.group(1)
                else:
                    m2 = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', drive_url)
                    if m2:
                        fid = m2.group(1)

                if fid:
                    try:
                        drive_session.upload_file_in_place(fid, patched_bytes)
                        drive_updated = True
                        synced_drive += 1
                    except Exception as exc:
                        logger.warning("Drive upload error for %s (file %s): %s", rid, fid, exc)

            # Update row in results
            fixed_records += 1
            if new_county:
                row["step6_county"] = new_county

            # Update physical location if it contains old_zip
            loc = str(row.get("step6_physical_location") or "")
            if old_zip and old_zip in loc:
                row["step6_physical_location"] = loc.replace(old_zip, new_zip)

            # Update step6_data_json
            data_json_str = str(row.get("step6_data_json") or "").strip()
            if data_json_str:
                try:
                    d = json.loads(data_json_str)
                    if new_county:
                        d["step6_county"] = new_county
                    if "step6_physical_location" in d and old_zip in str(d["step6_physical_location"]):
                        d["step6_physical_location"] = str(d["step6_physical_location"]).replace(old_zip, new_zip)
                    row["step6_data_json"] = json.dumps(d, ensure_ascii=False)
                except Exception:
                    pass

            detail_item = {
                "record_id": rid,
                "batch_id": bid,
                "name": rec_name,
                "city": city,
                "state": state,
                "old_zip": old_zip,
                "new_zip": new_zip,
                "county": new_county,
                "pdf_modified": pdf_modified,
                "drive_updated": drive_updated,
            }
            details.append(detail_item)

        # Emit per-item progress update so UI sees live activity
        if progress_cb:
            status_text = ""
            if was_fixed and test_rec["zip"] != current_zip:
                status_text = f"Sửa ZIP {old_zip} ➔ {new_zip}"
                if pdf_modified:
                    status_text += " [PDF ✓]"
                if drive_updated:
                    status_text += " [Drive ✓]"
            else:
                status_text = f"ZIP {current_zip} chuẩn bưu điện"

            progress_cb({
                "type": "progress",
                "current": count,
                "total": total_matched,
                "fixed_records": fixed_records,
                "fixed_pdfs": fixed_pdfs,
                "synced_drive": synced_drive,
                "fixed_queue_jobs": queue_stats.get("fixed", 0),
                "record_id": rid,
                "name": rec_name,
                "action": "fixed" if (was_fixed and test_rec["zip"] != current_zip) else "verified",
                "message": f"[{count}/{total_matched}] {rid} ({rec_name[:20]}): {status_text}",
            })

    # Save results.csv & results.xlsx
    if fix_csv and fixed_records > 0:
        temp_csv = csv_path.with_suffix(".csv.tmp")
        with temp_csv.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=RESULT_HEADERS, extrasaction="ignore")
            writer.writeheader()
            for r in all_rows:
                writer.writerow({k: r.get(k, "") for k in RESULT_HEADERS})
        temp_csv.replace(csv_path)

        # Sync formatted XLSX
        try:
            _sync_styled_xlsx(csv_path)
        except Exception as exc:
            logger.warning("Could not sync XLSX: %s", exc)

    q_fixed = queue_stats.get("fixed", 0)
    q_scanned = queue_stats.get("scanned", 0)
    final_res = {
        "ok": True,
        "scanned": len(all_rows),
        "matched": total_matched,
        "fixed_records": fixed_records,
        "fixed_pdfs": fixed_pdfs,
        "synced_drive": synced_drive,
        "fixed_queue_jobs": q_fixed,
        "scanned_queue_jobs": q_scanned,
        "details": details,
        "message": f"Hoàn tất Auto Validate! Chuẩn hóa {q_fixed}/{q_scanned} jobs hàng đợi, sửa {fixed_records} kết quả, patch {fixed_pdfs} PDF notice và đồng bộ {synced_drive} file Google Drive.",
    }

    if progress_cb:
        progress_cb({
            "type": "done",
            **final_res,
        })

    return final_res
