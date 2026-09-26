"""
Output ZIP Code Fixer & Synchronizer
Scans outputs/results.csv, queue.db, and corresponding PDF notices to detect and
surgically fix incorrect/PO Box ZIP codes in-place using US Census Bureau Geocoder
and USPS postal rules, preserving IRS PDF417 barcodes 100%.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import re
import sqlite3
import sys
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

import requests

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


def extract_file_id_from_url(url: str) -> str:
    """Extracts the Google Drive file ID from a view or download URL."""
    if not url:
        return ""
    m1 = re.search(r"/file/d/([a-zA-Z0-9_-]+)", url)
    if m1:
        return m1.group(1)
    m2 = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
    if m2:
        return m2.group(1)
    return ""


def fix_pdf_zip_stream(pdf_bytes: bytes, old_zip: str, new_zip: str) -> Optional[bytes]:
    """
    Surgically replaces old_zip with new_zip in the IRS notice PDF in-memory bytes.
    Preserves PDF417 barcode (y < 70) 100%.
    """
    if pymupdf is None or not pdf_bytes:
        return None

    raw_old = re.sub(r"\D", "", str(old_zip or "")).strip()
    raw_new = re.sub(r"\D", "", str(new_zip or "")).strip().zfill(5)

    if not raw_old or not raw_new or raw_old == raw_new:
        return None

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        if len(doc) == 0:
            return None
        page = doc[0]

        # Method 1 (100% Native Stream Patch): Replaces old ZIP directly in page content stream
        stream_changed = False
        for xref in page.get_contents():
            stream_bytes = doc.xref_stream(xref)
            text = stream_bytes.decode("latin1", errors="ignore")
            if raw_old in text:
                pattern = re.compile(r"(\([^\)]*?)" + re.escape(raw_old) + r"([^\)]*\)\s*Tj)")
                new_text = pattern.sub(r"\g<1>" + raw_new + r"\g<2>", text)
                if new_text != text:
                    doc.update_stream(xref, new_text.encode("latin1"))
                    stream_changed = True
            else:
                m = re.search(r"(\([A-Za-z\s.-]+,\s*[A-Za-z]{2}\s+)\d{5}(\)\s*Tj)", text)
                if m:
                    new_text = text[: m.start()] + m.group(1) + raw_new + m.group(2) + text[m.end() :]
                    doc.update_stream(xref, new_text.encode("latin1"))
                    stream_changed = True

        if stream_changed:
            return doc.tobytes()

        # Method 2: Visual span replacement (redact + insert)
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

        safe_rect = pymupdf.Rect(rect.x0, rect.y0 + 2.2, rect.x1, rect.y1)
        page.add_redact_annot(safe_rect, fill=(1, 1, 1))
        page.apply_redactions()

        page.insert_text(
            pymupdf.Point(rect.x0, baseline_y),
            raw_new,
            fontname="helv",
            fontsize=font_size,
            color=(0, 0, 0),
        )

        return doc.tobytes()
    except Exception as exc:
        logger.error("Error patching PDF bytes: %s", exc)
        return None


def fix_pdf_zip_in_file(pdf_path: Path, old_zip: str, new_zip: str) -> Optional[bytes]:
    """
    Surgically replaces old_zip with new_zip in the IRS CP 575 notice PDF file on disk.
    Keeps the PDF417 barcode at top right (y < 70) 100% untouched.
    Returns bytes of the modified PDF, or None if unchanged/failed.
    """
    if pymupdf is None or not pdf_path.exists() or pdf_path.stat().st_size == 0:
        return None

    try:
        pdf_bytes = pdf_path.read_bytes()
        res_bytes = fix_pdf_zip_stream(pdf_bytes, old_zip, new_zip)
        if res_bytes:
            pdf_path.write_bytes(res_bytes)
        return res_bytes
    except Exception as exc:
        logger.error("Error fixing PDF %s: %s", pdf_path, exc)
        return None


def parse_location_from_pdf(pdf_path: Path) -> Optional[Tuple[str, str, str, str]]:
    """
    Extracts (street, city, state, zip) from the address block of the IRS notice PDF
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

        sorted_buckets = sorted(lines_by_y.keys())
        for idx_b, bucket in enumerate(sorted_buckets):
            line_spans = sorted(lines_by_y[bucket], key=lambda s: s["bbox"][0])
            line_text = " ".join(s.get("text", "").strip() for s in line_spans if s.get("text", "").strip())
            line_text = re.sub(r"\s+", " ", line_text).strip()

            # Look for CITY, STATE ZIP or CITY ST ZIP
            m = re.search(r"([A-Za-z\s.-]+),\s*([A-Za-z]{2})\s+(\d{5})", line_text)
            if not m:
                m = re.search(r"([A-Za-z\s.-]{2,})\s+([A-Za-z]{2})\s+(\d{5})", line_text)
            if m:
                city = m.group(1).strip()
                state = m.group(2).strip().upper()
                zip_code = m.group(3).strip()

                # Find street address line (line right before city/state/zip)
                street = ""
                for prev_idx in range(idx_b - 1, -1, -1):
                    p_spans = sorted(lines_by_y[sorted_buckets[prev_idx]], key=lambda s: s["bbox"][0])
                    cand = " ".join(s.get("text", "").strip() for s in p_spans if s.get("text", "").strip())
                    cand = re.sub(r"\s+", " ", cand).strip()
                    if cand:
                        street = cand
                        break

                return street, city, state, zip_code
    except Exception as exc:
        logger.debug("Could not parse location from PDF %s: %s", pdf_path, exc)
    return None


def batch_census_geocode(
    items: List[Dict[str, str]],
    timeout: int = 30,
) -> Dict[str, str]:
    """
    Sends batches of addresses to US Census Bureau Geocoding API:
    https://geocoding.geo.census.gov/geocoder/locations/addressbatch
    Each item: {'id': str, 'street': str, 'city': str, 'state': str, 'zip': str}
    Returns mapping {id: 5-digit USPS delivery ZIP code} for matches.
    """
    if not items:
        return {}

    lines = []
    for it in items:
        rid = it["id"]
        # Clean street: replace commas with space for CSV safety
        street = it.get("street", "").replace(",", " ").strip()
        city = it.get("city", "").replace(",", " ").strip()
        state = it.get("state", "").replace(",", " ").strip()
        z = it.get("zip", "").replace(",", " ").strip()
        lines.append(f"{rid},{street},{city},{state},{z}")

    csv_data = "\n".join(lines) + "\n"
    files = {"addressFile": ("batch.csv", csv_data.encode("utf-8"), "text/csv")}
    data = {"benchmark": "Public_AR_Current"}

    results: Dict[str, str] = {}
    try:
        resp = requests.post(
            "https://geocoding.geo.census.gov/geocoder/locations/addressbatch",
            files=files,
            data=data,
            timeout=timeout,
        )
        if resp.status_code == 200:
            for line in resp.text.splitlines():
                line = line.strip()
                if not line:
                    continue
                parts = [p.strip('"') for p in line.split('","')]
                if len(parts) >= 5 and parts[2] == "Match":
                    rec_id = parts[0].strip('"')
                    matched_addr = parts[4]
                    m = re.search(r',\s*([A-Z]{2}),\s*(\d{5})$', matched_addr)
                    if m:
                        results[rec_id] = m.group(2)
    except Exception as exc:
        logger.warning("Census batch geocoding error: %s", exc)

    return results


def load_queue_db_map(queue_db_path: Path) -> Dict[str, Dict[str, str]]:
    """
    Reads queue.db to extract original input row data (street, city, state, zip) keyed by
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
                street = str(rec.get("ADDRESS") or rec.get("address") or "").strip()
                city = str(rec.get("CITI") or rec.get("city") or "").strip()
                state = str(rec.get("BANG") or rec.get("state") or "").strip()
                zip_code = str(rec.get("ZIP") or rec.get("zip") or "").strip()
                county = str(rec.get("county") or "").strip()
                item = {
                    "street": street,
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
        return {"scanned": 0, "fixed": 0}

    scanned = 0
    fixed = 0
    updates: List[Tuple[str, str]] = []

    try:
        conn = sqlite3.connect(str(queue_db_path))
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT job_id, payload FROM jobs")
        rows = cur.fetchall()
        scanned = len(rows)

        for r in rows:
            job_id = r["job_id"]
            payload_str = r["payload"]
            try:
                payload = json.loads(payload_str)
            except Exception:
                continue

            rec = payload.get("record")
            if not isinstance(rec, dict):
                continue

            changed = auto_fix_record_postal(rec)
            if changed:
                payload["record"] = rec
                updates.append((json.dumps(payload, ensure_ascii=False), job_id))
                fixed += 1

        if updates:
            cur.executemany("UPDATE jobs SET payload = ? WHERE job_id = ?", updates)
            conn.commit()

        conn.close()
    except Exception as exc:
        logger.error("Error validating queue jobs: %s", exc)

    if progress_cb and fixed > 0:
        progress_cb({
            "type": "log",
            "message": f"⚡ Đã chuẩn hóa {fixed}/{scanned} jobs trong hàng đợi SQLite.",
        })

    return {"scanned": scanned, "fixed": fixed}


def scan_and_fix_outputs(
    storage_root: Path,
    scope: str = "all",  # "all", "today", "tonight"
    target_keys: Optional[List[str]] = None,  # specific keys e.g. ["batch_id:record_id"]
    fix_csv: bool = True,
    fix_pdfs: bool = True,
    sync_drive: bool = True,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """
    Scans outputs/results.csv, queue.db, and corresponding notice PDFs:
    1. Validates & auto-fixes queue.db jobs across all statuses.
    2. Validates addresses against US Census Bureau Geocoder for 100% verified USPS delivery ZIPs.
    3. Replaces old ZIPs in notice PDFs via native stream patching + visual redact.
    4. Downloads remote PDFs from Google Drive if missing on disk, patches them, and re-uploads in-place.
    5. Updates outputs/results.csv, results.xlsx, and outputs/results.db in-place.
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
    drive_state_candidates = [
        storage_root / "outputs" / "export_state" / "google-drive-auto-v1.json",
        storage_root / "export_state" / "google-drive-auto-v1.json",
        storage_root / "google-drive-auto-v1.json",
    ]
    for d_path in drive_state_candidates:
        if d_path.exists():
            try:
                d_state = json.loads(d_path.read_text("utf-8"))
                mapping = d_state.get("pdf_url_by_batch_record", {})
                if mapping:
                    drive_map.update(mapping)
            except Exception as exc:
                logger.warning("Could not read drive state from %s: %s", d_path, exc)

    # Also harvest drive URLs from CSV rows
    for r in all_rows:
        bid = str(r.get("batch_id") or "").strip()
        rid = str(r.get("record_id") or "").strip()
        d_url = str(r.get("drive_pdf_url") or r.get("PDF") or "").strip()
        if d_url and extract_file_id_from_url(d_url):
            if bid and rid:
                drive_map[f"{bid}:{rid}"] = d_url
                drive_map[f"{bid}::{rid}"] = d_url
            if rid:
                drive_map[rid] = d_url

    drive_session = None
    if sync_drive:
        drive_candidates = [
            (storage_root / "google-drive" / "oauth-web-client.json", storage_root / "google-drive" / "oauth-user.json"),
            (Path(sys.executable).parent / "private" / "google-drive" / "oauth-web-client.json", Path(sys.executable).parent / "private" / "google-drive" / "oauth-user.json"),
            (Path(r"F:\Herd\fox-auto\private\google-drive\oauth-web-client.json"), Path(r"F:\Herd\fox-auto\private\google-drive\oauth-user.json")),
        ]
        for client_p, user_p in drive_candidates:
            if client_p.exists() and user_p.exists():
                try:
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
        if row_matches_scope(r):
            matched_indices.append(idx)

    total_matched = len(matched_indices)
    if progress_cb:
        progress_cb({
            "type": "progress",
            "percent": 0,
            "current": 0,
            "total": total_matched,
            "fixed_records": 0,
            "fixed_pdfs": 0,
            "synced_drive": 0,
            "fixed_queue_jobs": queue_stats.get("fixed", 0),
            "message": f"Bắt đầu Auto Validate {total_matched} hồ sơ kết quả...",
        })

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

    # Pre-collect address items for US Census Bureau batch validation
    census_candidates: List[Dict[str, str]] = []
    for idx in matched_indices:
        row = all_rows[idx]
        bid = str(row.get("batch_id") or "").strip()
        rid = str(row.get("record_id") or "").strip()
        k1 = f"{bid}:{rid}"
        k2 = f"{bid}::{rid}"
        queue_info = queue_map.get(k1) or queue_map.get(k2) or queue_map.get(rid) or {}

        street = queue_info.get("street") or str(row.get("step6_address") or "").strip()
        city = queue_info.get("city") or str(row.get("step6_city") or "").strip()
        state = queue_info.get("state") or str(row.get("step6_state") or "").strip()
        z = queue_info.get("zip") or ""

        if not z:
            loc = str(row.get("step6_physical_location") or "")
            m_zip = re.search(r"\b(\d{5})\b", loc)
            if m_zip:
                z = m_zip.group(1)

        if street and city and state:
            census_candidates.append({
                "id": rid,
                "street": street,
                "city": city,
                "state": state,
                "zip": z,
            })

    census_zip_map: Dict[str, str] = {}
    if census_candidates:
        if progress_cb:
            progress_cb({
                "type": "log",
                "message": f"🌐 Đang đối chiếu {len(census_candidates)} địa chỉ qua bưu điện US Census Bureau...",
            })
        chunk_size = 200
        for c_start in range(0, len(census_candidates), chunk_size):
            c_chunk = census_candidates[c_start : c_start + chunk_size]
            c_res = batch_census_geocode(c_chunk, timeout=35)
            census_zip_map.update(c_res)

        if progress_cb and census_zip_map:
            progress_cb({
                "type": "log",
                "message": f"✅ US Census Bureau đã khớp chính xác {len(census_zip_map)}/{len(census_candidates)} địa chỉ bưu điện.",
            })

    fixed_records = 0
    fixed_pdfs = 0
    synced_drive = 0
    details: List[Dict[str, Any]] = []

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

        # Collect candidate PDF files on disk
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
        city = queue_info.get("city") or str(row.get("step6_city") or "").strip()
        state = queue_info.get("state") or str(row.get("step6_state") or "").strip()
        current_zip = queue_info.get("zip") or ""
        street = queue_info.get("street") or str(row.get("step6_address") or "").strip()

        # Check candidate PDFs for actual text on disk (primary source for PDF notice)
        pdf_extracted = None
        pdf_actual_zip = ""
        for candidate in candidates:
            pdf_extracted = parse_location_from_pdf(candidate)
            if pdf_extracted:
                street = street or pdf_extracted[0]
                city = city or pdf_extracted[1]
                state = state or pdf_extracted[2]
                pdf_actual_zip = pdf_extracted[3]
                break

        # Fallback zip to evaluate
        eval_zip = pdf_actual_zip or current_zip
        if not eval_zip:
            loc = str(row.get("step6_physical_location") or "")
            m_zip = re.search(r"\b(\d{5})\b", loc)
            if m_zip:
                eval_zip = m_zip.group(1)

        # Determine target zip: Census geocode match > Postal rule
        status_reason = "Postal rule"
        census_zip = census_zip_map.get(rid)
        was_fixed = False

        if census_zip and len(census_zip) == 5:
            new_zip = census_zip
            test_rec = {
                "city": city,
                "state": state,
                "zip": new_zip,
                "county": str(row.get("step6_county") or ""),
            }
            auto_fix_record_postal(test_rec)
            was_fixed = (new_zip != eval_zip)
            status_reason = "USPS/Census"
        else:
            test_rec = {
                "city": city,
                "state": state,
                "zip": eval_zip,
                "county": str(row.get("step6_county") or ""),
            }
            was_fixed = auto_fix_record_postal(test_rec)
            new_zip = test_rec["zip"]

        pdf_modified = False
        drive_updated = False
        old_zip = eval_zip or current_zip
        new_county = test_rec.get("county") or row.get("step6_county")

        # Determine if PDF needs fixing: either postal fixer changed it, or PDF's actual zip != new_zip
        needs_pdf_fix = bool(fix_pdfs and (
            (pdf_actual_zip and pdf_actual_zip != new_zip) or
            (was_fixed and old_zip != new_zip)
        ))

        patched_bytes: Optional[bytes] = None
        drive_url = drive_map.get(k1) or drive_map.get(k2) or drive_map.get(rid) or str(row.get("drive_pdf_url") or "")
        fid = extract_file_id_from_url(drive_url)

        if needs_pdf_fix:
            replace_from = pdf_actual_zip or old_zip

            # If no local PDF file exists on disk, download remote PDF from Google Drive to local storage
            if not candidates and drive_session and fid:
                try:
                    remote_bytes = drive_session.download_file(fid)
                    target_p = p_final or p_pdf or (storage_root / "final_pdfs" / (bid or "default") / f"{rec_name} - {rid}.pdf")
                    target_p.parent.mkdir(parents=True, exist_ok=True)
                    target_p.write_bytes(remote_bytes)
                    candidates.append(target_p)
                except Exception as exc:
                    logger.warning("Could not download remote PDF from Drive for %s (%s): %s", rid, fid, exc)

            for candidate in candidates:
                res_bytes = fix_pdf_zip_in_file(candidate, replace_from, new_zip)
                if res_bytes:
                    pdf_modified = True
                    patched_bytes = res_bytes

        if pdf_modified:
            fixed_pdfs += 1

        # Sync to Google Drive if applicable
        if drive_session and patched_bytes and fid:
            try:
                drive_session.upload_file_in_place(fid, patched_bytes)
                drive_updated = True
                synced_drive += 1
            except Exception as exc:
                logger.warning("Drive upload error for %s (file %s): %s", rid, fid, exc)

        record_changed = bool(
            (was_fixed and new_zip != current_zip) or
            pdf_modified or
            (new_county and new_county != row.get("step6_county"))
        )

        if record_changed:
            fixed_records += 1
            if new_county:
                row["step6_county"] = new_county
            if new_zip and old_zip and row.get("step6_physical_location"):
                row["step6_physical_location"] = re.sub(
                    r"\b" + re.escape(old_zip) + r"\b",
                    new_zip,
                    row["step6_physical_location"],
                )
            details.append({
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
                "source": status_reason,
            })

            # Also update SQLite results.db if present
            results_db_path = storage_root / "outputs" / "results.db"
            if results_db_path.exists():
                try:
                    conn_r = sqlite3.connect(str(results_db_path))
                    cur_r = conn_r.cursor()
                    cur_r.execute(
                        """
                        UPDATE results
                        SET step6_county = ?, step6_physical_location = ?
                        WHERE (batch_id = ? AND record_id = ?) OR record_id = ?
                        """,
                        (
                            new_county,
                            row.get("step6_physical_location", ""),
                            bid,
                            rid,
                            rid,
                        ),
                    )
                    conn_r.commit()
                    conn_r.close()
                except Exception as exc:
                    logger.debug("Could not update results.db for %s: %s", rid, exc)

        # Emit per-item progress update so UI sees live activity
        if progress_cb:
            status_text = ""
            if record_changed or pdf_modified:
                status_text = f"Sửa ZIP {old_zip or pdf_actual_zip} ➔ {new_zip} ({status_reason})"
                if pdf_modified:
                    status_text += " [PDF ✓]"
                if drive_updated:
                    status_text += " [Drive ✓]"
            else:
                status_text = f"ZIP {new_zip or eval_zip} chuẩn bưu điện"

            progress_cb({
                "type": "progress",
                "percent": int(round((count / total_matched) * 100)) if total_matched > 0 else 100,
                "current": count,
                "total": total_matched,
                "fixed_records": fixed_records,
                "fixed_pdfs": fixed_pdfs,
                "synced_drive": synced_drive,
                "fixed_queue_jobs": queue_stats.get("fixed", 0),
                "record_id": rid,
                "name": rec_name,
                "action": "fixed" if (record_changed or pdf_modified) else "verified",
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
