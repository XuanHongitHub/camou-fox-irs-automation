from __future__ import annotations

import logging
import random
import re
import sys
import time
import csv
from hashlib import md5
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import requests

from .config import AppConfig, WorkflowStep
from .logging_utils import ensure_dir
from .models import JobStatus, ProxyEndpoint, ProxyRotationResult
from .proxyxoay_client import ProxyVm, ProxyXoayClient, ProxyXoayHttpError

logger = logging.getLogger(__name__)


class RunnerError(RuntimeError):
    pass


class FlowStepError(RunnerError):
    def __init__(self, step: str, message: str):
        super().__init__(message)
        self.step = step
        self.message = message


MONTH_VALUES = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
]

ZIP_COUNTY_MAP = {
    "74112": "Tulsa",
    "73005": "Caddo",
}

CITY_STATE_COUNTY_MAP = {
    ("TULSA", "OK"): "Tulsa",
    ("ANADARKO", "OK"): "Caddo",
}

_ZIP_COUNTY_CACHE: Optional[Dict[str, str]] = None
_SUPPORTED_PROXY_SCHEMES = {"http", "https", "socks5", "socks5h", "socks4", "socks4a"}


def _norm_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", key.lower())


def _get(record: Dict[str, Any], *keys: str) -> str:
    normalized = {_norm_key(k): v for k, v in record.items()}
    for key in keys:
        val = normalized.get(_norm_key(key))
        if val is None:
            continue
        text = str(val).strip()
        if text:
            return text
    return ""


def _split_name(full_name: str) -> Tuple[str, str, str]:
    parts = [p for p in re.split(r"\s+", full_name.strip()) if p]
    if not parts:
        return "", "", ""
    if len(parts) == 1:
        return parts[0], "", parts[0]
    if len(parts) == 2:
        return parts[0], "", parts[1]
    return parts[0], " ".join(parts[1:-1]), parts[-1]


def _collapse_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _sanitize_name_part(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z\s\-']", " ", str(value or ""))
    return _collapse_spaces(cleaned)


def _sanitize_address(value: str) -> str:
    # Keep address conservative to avoid IRS validation rejects on special chars.
    raw = str(value or "")
    # Physical street forms reject P.O. Box; degrade it to BOX rather than
    # submitting the forbidden token sequence.
    raw = re.sub(r"\bP\s*\.?\s*O\s*\.?\s*BOX\b", "BOX", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r"[^A-Za-z0-9\s/\-]", " ", raw)
    return _collapse_spaces(cleaned)


def _sanitize_city(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z\s\-'.]", " ", str(value or ""))
    return _collapse_spaces(cleaned)


def _sanitize_county(value: str) -> str:
    # IRS note: only '-' and '&' are accepted as special chars for County Name.
    cleaned = re.sub(r"[^A-Za-z\s\-&]", " ", str(value or ""))
    cleaned = _collapse_spaces(cleaned)
    cleaned = re.sub(r"^[\s\-&]+|[\s\-&]+$", "", cleaned)
    return cleaned


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _country_is_us(country: str) -> bool:
    v = re.sub(r"\s+", " ", (country or "").strip().upper())
    return v in {"US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"}


def _looks_like_county(value: str) -> bool:
    v = re.sub(r"\s+", " ", (value or "").strip())
    if not v:
        return False
    upper = v.upper()
    return upper.endswith(" COUNTY") or upper.endswith(" PARISH")


def _normalize_county(value: str) -> str:
    v = re.sub(r"\s+", " ", (value or "").strip())
    if not v:
        return ""
    # IRS county field accepts the locality name better than long legal suffixes.
    # Some sources produce hybrid values like "East Baton Rouge Parish County".
    normalized = re.sub(r"(?:\s+(?:county|parish))+\s*$", "", v, flags=re.IGNORECASE).strip()
    return normalized or v


def _seed_month(record_id: str) -> str:
    token = record_id or str(time.time())
    idx = int(md5(token.encode("utf-8")).hexdigest()[:8], 16) % 12
    return MONTH_VALUES[idx]


_POSTAL_DB_CACHE: Optional[Dict[Tuple[str, str], Dict[str, Any]]] = None

USPS_EXPANSIONS = {
    "CORP CHRISTI": "CORPUS CHRISTI",
    "N LAS VEGAS": "NORTH LAS VEGAS",
    "FT WORTH": "FORT WORTH",
    "ST LOUIS": "SAINT LOUIS",
    "MT PROSPECT": "MOUNT PROSPECT",
    "E PEORIA": "EAST PEORIA",
    "W VALLEY CITY": "WEST VALLEY CITY",
    "N MIAMI": "NORTH MIAMI",
    "S SAN FRANCISCO": "SOUTH SAN FRANCISCO",
    "W CHESTER": "WEST CHESTER",
    "N CHARLESTON": "NORTH CHARLESTON",
    "ST PETERSBURG": "SAINT PETERSBURG",
    "VALLEY VLG": "VALLEY VILLAGE",
    "GROSSE PT PK": "GROSSE POINTE PARK",
    "POWDER SPGS": "POWDER SPRINGS",
    "WEST PALM BCH": "WEST PALM BEACH",
}

USPS_REGEX_REPLACEMENTS = [
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


def _load_postal_database() -> Dict[Tuple[str, str], Dict[str, Any]]:
    global _POSTAL_DB_CACHE
    if _POSTAL_DB_CACHE is not None:
        return _POSTAL_DB_CACHE

    db: Dict[Tuple[str, str], Dict[str, Any]] = {}
    base_dir = Path(__file__).resolve().parent / "data"
    possible_paths = [
        base_dir / "us_city_zip_county.csv",
    ]
    if hasattr(sys, "_MEIPASS"):
        possible_paths.insert(0, Path(sys._MEIPASS) / "irs_bot" / "data" / "us_city_zip_county.csv")

    data_path = None
    for p in possible_paths:
        if p and p.exists():
            data_path = p
            break

    if data_path and data_path.exists():
        try:
            with data_path.open("r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    c = str(row.get("city", "")).strip().upper()
                    s = str(row.get("state", "")).strip().upper()
                    pz = str(row.get("primary_zip", "")).strip().zfill(5)
                    cnt = str(row.get("county", "")).strip()
                    valid_zips = set(str(row.get("valid_zips", "")).split(";"))
                    db[(c, s)] = {
                        "primary_zip": pz,
                        "county": cnt,
                        "valid_zips": valid_zips,
                    }
        except Exception as exc:
            logger.warning("Failed to load postal dataset from %s: %s", data_path, exc)

    _POSTAL_DB_CACHE = db
    return db


def auto_fix_record_postal(record: Dict[str, Any]) -> bool:
    """Auto-corrects mismatched, truncated, or fallback ZIP codes and County in-place."""
    db = _load_postal_database()
    c = _sanitize_city(_get(record, "CITI", "city")).upper()
    s = _collapse_spaces(_get(record, "BANG", "state")).upper()
    z = _digits(_get(record, "ZIP", "zip"))

    if not c or not s:
        return False

    info = db.get((c, s))
    if not info and c in USPS_EXPANSIONS:
        info = db.get((USPS_EXPANSIONS[c], s))

    if not info:
        expanded = c
        for pattern, repl in USPS_REGEX_REPLACEMENTS:
            expanded = re.sub(pattern, repl, expanded)
        expanded = re.sub(r"\s+", " ", expanded).strip()
        info = db.get((expanded, s))

    fixed = False
    if info:
        # Check if 4 digits (lost leading zero in Excel, e.g. 7039 -> 07039)
        padded_z = z.zfill(5) if (0 < len(z) <= 5) else ""
        current_valid = len(padded_z) == 5 and padded_z in info["valid_zips"]
        
        if current_valid:
            if len(z) == 4:
                record["ZIP"] = padded_z
                if "zip" in record:
                    record["zip"] = padded_z
                logger.info("Auto-padded 4-digit ZIP with leading zero for [%s, %s]: '%s' -> '%s'", c, s, z, padded_z)
                fixed = True
            # ZIP is already valid for this city; ensure county is set if empty or generic fallback
            current_county = str(record.get("county", "")).strip().upper()
            if not current_county or current_county in {"UNKNOWN", "DALLAS", "LOS ANGELES", "MIAMI-DADE", "COOK"}:
                if info["county"] and current_county != info["county"].upper():
                    record["county"] = info["county"]
                    fixed = True
        else:
            new_zip = info["primary_zip"]
            record["ZIP"] = new_zip
            if "zip" in record:
                record["zip"] = new_zip
            record["county"] = info["county"]
            logger.info("Auto-corrected ZIP & County for [%s, %s]: '%s' -> '%s', county -> '%s'", c, s, z, new_zip, info["county"])
            fixed = True
    else:
        # Fallback: if 4 digits (lost leading zero in Excel), pad with zero
        if 0 < len(z) < 5:
            padded = z.zfill(5)
            record["ZIP"] = padded
            if "zip" in record:
                record["zip"] = padded
            logger.info("Auto-padded 4-digit ZIP with leading zero for [%s, %s]: '%s' -> '%s'", c, s, z, padded)
            fixed = True

    return fixed


def _load_zip_county_map() -> Dict[str, str]:
    global _ZIP_COUNTY_CACHE
    if _ZIP_COUNTY_CACHE is not None:
        return _ZIP_COUNTY_CACHE

    data_map: Dict[str, str] = dict(ZIP_COUNTY_MAP)
    data_path = Path(__file__).resolve().parent / "data" / "us_zip_county.csv"
    if data_path.exists():
        try:
            with data_path.open("r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    z = _digits(str(row.get("zip", "")))[:5]
                    county = str(row.get("county", "")).strip()
                    if z and county:
                        data_map[z] = county
        except Exception as exc:
            logger.warning("Failed to load zip->county dataset from %s: %s", data_path, exc)
    _ZIP_COUNTY_CACHE = data_map
    return data_map


def _resolve_county(zip_code: str, city: str, state: str) -> str:
    db = _load_postal_database()
    c = city.strip().upper()
    s = state.strip().upper()
    info = db.get((c, s))
    if not info and c in USPS_EXPANSIONS:
        info = db.get((USPS_EXPANSIONS[c], s))
    if info and info.get("county"):
        return info["county"]

    z = _digits(zip_code)[:5]
    zip_map = _load_zip_county_map()
    if z in zip_map:
        return zip_map[z]
    key = (c, s)
    if key in CITY_STATE_COUNTY_MAP:
        return CITY_STATE_COUNTY_MAP[key]
    if city.strip():
        return city.strip()
    return "Unknown"


def _click_first(page: Any, selectors: list[str], timeout_ms: int) -> bool:
    deadline = time.time() + max(0.5, timeout_ms / 1000.0)
    poll_ms = 150
    while time.time() < deadline:
        for selector in selectors:
            locator = page.locator(selector)
            try:
                count = locator.count()
            except Exception:
                count = 0
            if count == 0:
                continue
            try:
                locator.first.click(timeout=min(timeout_ms, 1200))
                return True
            except Exception:
                pass
            try:
                clicked = bool(
                    page.evaluate(
                        """
                        (sel) => {
                          const el = document.querySelector(sel);
                          if (!el) return false;
                          try {
                            el.scrollIntoView({ block: 'center', inline: 'center' });
                            ['pointerdown','mousedown','mouseup','click'].forEach((t) =>
                              el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
                            );
                            return true;
                          } catch (_) {
                            return false;
                          }
                        }
                        """,
                        selector,
                    )
                )
                if clicked:
                    return True
            except Exception:
                pass
        page.wait_for_timeout(poll_ms)
    return False


def _set_checked(page: Any, selector: str, timeout_ms: int) -> None:
    page.wait_for_selector(selector, state="attached", timeout=timeout_ms)

    def _checked() -> bool:
        try:
            locator_now = page.locator(selector).first
            if bool(locator_now.is_checked()):
                return True
        except Exception:
            pass
        try:
            return bool(
                page.evaluate(
                    """
                    (sel) => {
                      const el = document.querySelector(sel);
                      return !!(el && el.checked);
                    }
                    """,
                    selector,
                )
            )
        except Exception:
            return False

    for _ in range(4):
        locator = page.locator(selector).first
        if _checked():
            return

        # 1) Fast DOM-first toggle for pages that redraw inputs or hide the native control.
        try:
            done = bool(
                page.evaluate(
                    """
                    (sel) => {
                      const el = document.querySelector(sel);
                      if (!el) return false;
                      try {
                        el.scrollIntoView({ block: 'center', inline: 'center' });
                        const id = el.getAttribute('id');
                        if (id) {
                          const lb = document.querySelector(`label[for="${id}"]`);
                          if (lb && typeof lb.click === 'function') lb.click();
                        }
                        if (!el.checked && typeof el.click === 'function') el.click();
                        if (!el.checked) el.checked = true;
                        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                        return !!el.checked;
                      } catch (_) {
                        return false;
                      }
                    }
                    """,
                    selector,
                )
            )
            if done:
                page.wait_for_timeout(50)
                if _checked():
                    return
        except Exception:
            pass

        # 2) Trusted check (best for SPA state updates)
        try:
            locator.check(timeout=min(timeout_ms, 1200))
        except Exception:
            pass
        if _checked():
            return

        # 3) Click associated label (many IRS controls rely on this)
        try:
            dom_id = locator.get_attribute("id")
            if dom_id:
                label = page.locator(f'label[for="{dom_id}"]').first
                if label.count() > 0:
                    label.click(timeout=min(timeout_ms, 1200))
        except Exception:
            pass
        if _checked():
            return

        # 4) Force click input
        try:
            locator.click(timeout=min(timeout_ms, 1200), force=True)
        except Exception:
            pass
        if _checked():
            return

        # 5) Focus + Space key (some accessible radio implementations rely on keyboard events)
        try:
            locator.focus(timeout=min(timeout_ms, 1000))
            page.keyboard.press(" ")
        except Exception:
            pass
        if _checked():
            return

        # 6) Direct group assignment fallback for radios by name/value.
        try:
            done = bool(
                page.evaluate(
                    """
                    (sel) => {
                      const el = document.querySelector(sel);
                      if (!el) return false;
                      const name = el.getAttribute('name');
                      const value = el.getAttribute('value');
                      if (!name || value == null) return false;
                      const all = Array.from(document.querySelectorAll(`input[type="radio"][name="${name}"]`));
                      all.forEach((n) => { n.checked = false; });
                      const target = all.find((n) => n.getAttribute('value') === value);
                      if (!target) return false;
                      target.checked = true;
                      target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                      target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                      return !!target.checked;
                    }
                    """,
                    selector,
                )
            )
            if done:
                return
        except Exception:
            pass

        page.wait_for_timeout(80)

    raise RunnerError(f"Cannot check selector: {selector}")


def _select_option_retry(page: Any, selector: str, value: str, timeout_ms: int, attempts: int = 3) -> None:
    target = str(value or "").strip()
    if not target:
        raise RunnerError(f"Missing select value for selector: {selector}")
    norm_target = re.sub(r"\s+", " ", target).strip()
    norm_upper = norm_target.upper()
    # If caller passes full state name, map to USPS code for IRS dropdowns.
    us_state_name_to_code = {
        "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR",
        "CALIFORNIA": "CA", "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE",
        "DISTRICT OF COLUMBIA": "DC", "FLORIDA": "FL", "GEORGIA": "GA", "HAWAII": "HI",
        "IDAHO": "ID", "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS",
        "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD",
        "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS",
        "MISSOURI": "MO", "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV",
        "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
        "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK",
        "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
        "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT",
        "VERMONT": "VT", "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV",
        "WISCONSIN": "WI", "WYOMING": "WY",
    }
    if len(norm_upper) > 2 and norm_upper in us_state_name_to_code:
        norm_target = us_state_name_to_code[norm_upper]
        norm_upper = norm_target

    def _is_selected() -> bool:
        try:
            return bool(
                page.evaluate(
                    """
                    ({ sel, val }) => {
                      const el = document.querySelector(sel);
                      if (!el) return false;
                      const target = String(val || '').trim().toUpperCase();
                      const current = String(el.value || '').trim().toUpperCase();
                      if (current === target) return true;
                      const selected = Array.from(el.selectedOptions || []);
                      return selected.some((o) => {
                        const ov = String(o.value || '').trim().toUpperCase();
                        const ot = String(o.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase();
                        return ov === target || ot === target;
                      });
                    }
                    """,
                    {"sel": selector, "val": norm_target},
                )
            )
        except Exception:
            return False

    def _resolve_candidate_value() -> str:
        try:
            candidate = page.evaluate(
                """
                ({ sel, val }) => {
                  const all = Array.from(document.querySelectorAll(sel));
                  if (!all.length) return '';
                  const visibleSelect = all.find((el) => {
                    try {
                      const st = window.getComputedStyle(el);
                      const r = el.getBoundingClientRect();
                      return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                    } catch (_) {
                      return true;
                    }
                  }) || all[0];
                  const target = String(val || '').trim().toUpperCase();
                  const options = Array.from(visibleSelect.options || []);
                  if (!options.length) return '';

                  const normText = (x) => String(x || '').replace(/\\s+/g, ' ').trim().toUpperCase();
                  const byValue = options.find((o) => normText(o.value) === target);
                  if (byValue) return String(byValue.value || '');

                  const byTextExact = options.find((o) => normText(o.textContent) === target);
                  if (byTextExact) return String(byTextExact.value || '');

                  const byTextContains = options.find((o) => {
                    const txt = normText(o.textContent);
                    return txt.includes(`(${target})`) || txt.includes(` ${target} `) || txt.endsWith(` ${target}`) || txt.startsWith(`${target} `) || txt.includes(target);
                  });
                  if (byTextContains) return String(byTextContains.value || '');

                  return '';
                }
                """,
                {"sel": selector, "val": norm_target},
            )
            return str(candidate or "").strip()
        except Exception:
            return ""

    for attempt in range(1, max(1, int(attempts)) + 1):
        page.wait_for_selector(selector, state="visible", timeout=timeout_ms)
        # Wait options load for SPA/rerender cases.
        try:
            page.wait_for_function(
                """
                (sel) => {
                  const all = Array.from(document.querySelectorAll(sel));
                  if (!all.length) return false;
                  const el = all.find((x) => {
                    try {
                      const st = window.getComputedStyle(x);
                      const r = x.getBoundingClientRect();
                      return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                    } catch (_) { return true; }
                  }) || all[0];
                  return (el.options || []).length > 1;
                }
                """,
                arg=selector,
                timeout=min(timeout_ms, 2000),
            )
        except Exception:
            pass
        if _is_selected():
            return

        candidate = _resolve_candidate_value() or norm_target

        # 1) Native select by value.
        try:
            page.select_option(selector, value=candidate, timeout=min(timeout_ms, 1800))
        except Exception:
            pass
        if _is_selected():
            return

        # 2) Native select by visible label.
        try:
            page.select_option(selector, label=norm_target, timeout=min(timeout_ms, 1800))
        except Exception:
            pass
        if _is_selected():
            return

        # 3) JS fallback with case-insensitive match on option value/text.
        try:
            changed = bool(
                page.evaluate(
                    """
                    ({ sel, val }) => {
                      const el = document.querySelector(sel);
                      if (!el) return false;
                      const target = String(val || '').trim().toUpperCase();
                      const options = Array.from(el.options || []);
                      let found = options.find((o) => String(o.value || '').trim().toUpperCase() === target);
                      if (!found) {
                        found = options.find((o) => String(o.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase() === target);
                      }
                      if (!found) return false;
                      el.value = String(found.value || '');
                      options.forEach((o) => { o.selected = (o === found); });
                      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                      return true;
                    }
                    """,
                    {"sel": selector, "val": candidate or norm_target},
                )
            )
            if changed and _is_selected():
                return
        except Exception:
            pass

        page.wait_for_timeout(120 * attempt)

    raise RunnerError(f"Cannot select option '{norm_target}' for selector: {selector}")


def _extract_visible_error(page: Any) -> str:
    try:
        messages = page.evaluate(
            """
            () => {
              const selectors = [
                '[role="alert"]',
                '.usa-alert__text',
                '.usa-error-message',
                '.usa-input-error-message',
                '.error',
                '.errors',
                '.invalid-feedback',
                '.alert-danger',
                '.form-error',
              ];
              const out = [];
              const seen = new Set();
              const visible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                if (!style || style.visibility === 'hidden' || style.display === 'none') return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              };
              for (const sel of selectors) {
                for (const el of document.querySelectorAll(sel)) {
                  if (!visible(el)) continue;
                  const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
                  if (!text) continue;
                  const norm = text.toLowerCase();
                  if (seen.has(norm)) continue;
                  seen.add(norm);
                  out.push(text);
                }
              }
              return out.slice(0, 4);
            }
            """
        )
        if isinstance(messages, list):
            text = " | ".join(str(item).strip() for item in messages if str(item).strip())
            return text[:600]
    except Exception:
        return ""
    return ""


def _looks_like_irs_validation_error(message: str) -> bool:
    text = str(message or "").lower()
    if not text:
        return False
    return any(token in text for token in [
        "the following error has occurred",
        "only special characters allowed",
        "is required",
        "invalid",
        "not permitted",
        "not allowed",
        "po boxes are not permitted",
        "p.o. boxes are not permitted",
        "p o boxes are not permitted",
        "physical address",
        "street:",
        "street address",
        "county name",
        "responsible party",
    ])


def _validate_record_fast(record: Dict[str, Any]) -> str:
    auto_fix_record_postal(record)
    full_name = _collapse_spaces(_get(record, "NAME", "name"))
    ssn = _digits(_get(record, "SSN", "ssn"))
    address = _sanitize_address(_get(record, "ADDRESS", "address"))
    city = _sanitize_city(_get(record, "CITI", "city"))
    state = _collapse_spaces(_get(record, "BANG", "state")).upper()
    zip_code = _digits(_get(record, "ZIP", "zip"))

    if not full_name:
        return "Missing NAME"
    if len(ssn) != 9:
        return "Invalid SSN: expected exactly 9 digits"
    if not address:
        return "Missing ADDRESS"
    if not city:
        return "Missing CITI"
    if len(state) != 2:
        return "Invalid BANG/state: expected 2-letter state code"
    if len(zip_code) < 5:
        return "Invalid ZIP: expected at least 5 digits"
    return ""


def _fail_fast_after_continue(page: Any, artifact_dir: Path, tag: str) -> str:
    page.wait_for_timeout(350)
    hard_fail = _irs_hard_fail_message(page)
    if hard_fail:
        capture_reference_page(page, artifact_dir, tag)
        return hard_fail
    visible_error = _extract_visible_error(page)
    if _looks_like_irs_validation_error(visible_error):
        capture_reference_page(page, artifact_dir, tag)
        return visible_error
    return ""


def _set_checked_if_present(page: Any, selector: str, timeout_ms: int) -> bool:
    """Best-effort radio/checkbox set. Returns False when selector is absent."""
    try:
        if page.locator(selector).first.is_visible(timeout=min(timeout_ms, 400)):
            _set_checked(page, selector, timeout_ms)
            return True
        return False
    except Exception:
        return False


def _human_fill_if_present(
    page: Any,
    selector: str,
    value: str,
    config: AppConfig,
    timeout_ms: int,
) -> bool:
    """Best-effort text fill. Returns False when selector is absent."""
    try:
        if page.locator(selector).first.is_visible(timeout=min(timeout_ms, 400)):
            _human_fill(page, selector, value, config, timeout_ms)
            return True
        return False
    except Exception:
        return False
    return True


def _ensure_irs_sole_proprietor(page: Any, timeout_ms: int) -> None:
    """
    IRS step-1 can re-render quickly; ensure Sole Proprietor is truly selected
    before clicking Continue.
    """
    input_sel = 'input[name="legalStructureInput"][value="SOLE_PROPRIETOR"]'
    label_sel = 'label[for="SOLE_PROPRIETORlegalStructureInputid"]'
    page.wait_for_selector(input_sel, timeout=timeout_ms)

    for _ in range(3):
        try:
            # Prefer label click first for this specific IRS control.
            if page.locator(label_sel).count() > 0:
                page.locator(label_sel).first.click(timeout=min(timeout_ms, 3000), force=True)
        except Exception:
            pass
        try:
            _set_checked(page, input_sel, timeout_ms)
        except Exception:
            pass

        checked = bool(
            page.evaluate(
                """() => {
                  const el = document.querySelector('input[name="legalStructureInput"][value="SOLE_PROPRIETOR"]');
                  return !!(el && el.checked);
                }"""
            )
        )
        if checked:
            return
        page.wait_for_timeout(200)

    raise RunnerError("Failed to select legalStructureInput=SOLE_PROPRIETOR")


def _wait_irs_selector_or_hard_fail(
    page: Any,
    selector: str,
    timeout_ms: int,
    step_name: str,
) -> str:
    deadline = time.monotonic() + max(0.5, timeout_ms / 1000.0)
    first_exc: Exception | None = None

    while time.monotonic() < deadline:
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            return hard_fail
        try:
            if page.locator(selector).first.is_visible(timeout=250):
                return ""
        except Exception as exc:
            if first_exc is None:
                first_exc = exc
        page.wait_for_timeout(200)

    hard_fail = _irs_hard_fail_message(page)
    if hard_fail:
        return hard_fail

    logger.warning(
        "Step %s: selector %s not ready; reloading page once before retry",
        step_name,
        selector,
    )
    try:
        page.reload(timeout=timeout_ms, wait_until="domcontentloaded")
    except Exception:
        try:
            current_url = str(getattr(page, "url", "") or "")
            if current_url:
                page.goto(current_url, timeout=timeout_ms)
            elif first_exc is not None:
                raise first_exc
            else:
                page.wait_for_selector(selector, timeout=timeout_ms)
                return ""
        except Exception:
            if first_exc is not None:
                raise first_exc
            raise

    reload_deadline = time.monotonic() + max(0.5, timeout_ms / 1000.0)
    while time.monotonic() < reload_deadline:
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            return hard_fail
        try:
            if page.locator(selector).first.is_visible(timeout=250):
                return ""
        except Exception:
            pass
        page.wait_for_timeout(200)

    hard_fail = _irs_hard_fail_message(page)
    if hard_fail:
        return hard_fail
    if first_exc is not None:
        raise first_exc
    page.wait_for_selector(selector, timeout=min(timeout_ms, 1000))
    return ""


def _wait_irs_any_selector_or_hard_fail(
    page: Any,
    selectors: list[str],
    timeout_ms: int,
    step_name: str,
) -> str:
    deadline = time.monotonic() + max(0.5, timeout_ms / 1000.0)
    while time.monotonic() < deadline:
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            return hard_fail
        for selector in selectors:
            try:
                if page.locator(selector).first.is_visible(timeout=100):
                    return ""
            except Exception:
                pass
        page.wait_for_timeout(150)

    hard_fail = _irs_hard_fail_message(page)
    if hard_fail:
        return hard_fail

    logger.warning(
        "Step %s: none of selectors %s ready; reloading page once before retry",
        step_name,
        selectors,
    )
    try:
        page.reload(timeout=timeout_ms, wait_until="domcontentloaded")
    except Exception:
        pass

    reload_deadline = time.monotonic() + max(0.5, timeout_ms / 1000.0)
    while time.monotonic() < reload_deadline:
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            return hard_fail
        for selector in selectors:
            try:
                if page.locator(selector).first.is_visible(timeout=100):
                    return ""
            except Exception:
                pass
        page.wait_for_timeout(150)

    hard_fail = _irs_hard_fail_message(page)
    if hard_fail:
        return hard_fail
    raise RunnerError(f"Step {step_name}: none of selectors {selectors} became visible")


def _is_irs_entry_bootstrap_target(url: str) -> bool:
    text = str(url or "").strip().lower()
    return "sa.www4.irs.gov/applyein" in text


def _bootstrap_irs_application_start(page: Any, timeout_ms: int) -> None:
    """
    IRS production now often rejects direct deep-link opens.
    Always start from /applyein/ then click "Begin Application Now".
    """
    root_url = "https://sa.www4.irs.gov/applyein/"
    page.goto(root_url, timeout=timeout_ms, wait_until="domcontentloaded")
    page.wait_for_timeout(350)

    # Already at step 1 (e.g. resumed flow) -> continue.
    try:
        if page.locator('input[name="legalStructureInput"]').count() > 0:
            return
    except Exception:
        pass

    begin_selectors = [
        'a[aria-label*="Begin Application Now"]',
        'a[role="button"][aria-label*="Begin Application Now"]',
        'a:has-text("Begin Application Now")',
        'button:has-text("Begin Application Now")',
    ]
    clicked = _click_first(page, begin_selectors, min(timeout_ms, 12000))
    if not clicked:
        # Text-based fallback for minor DOM variants.
        try:
            clicked = bool(
                page.evaluate(
                    """
                    () => {
                      const nodes = Array.from(document.querySelectorAll('a, button, [role="button"]'));
                      const target = nodes.find((el) => {
                        const txt = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
                        return txt.includes('begin application now');
                      });
                      if (!target) return false;
                      try {
                        target.scrollIntoView({ block: 'center', inline: 'center' });
                        ['pointerdown','mousedown','mouseup','click'].forEach((t) =>
                          target.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
                        );
                        return true;
                      } catch (_) {
                        return false;
                      }
                    }
                    """
                )
            )
        except Exception:
            clicked = False
    if not clicked:
        raise RunnerError("Cannot find 'Begin Application Now' button on IRS landing page")

    # Wait for step-1 form to appear after begin click.
    try:
        page.wait_for_selector('input[name="legalStructureInput"]', timeout=min(timeout_ms, 20000))
    except Exception:
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            raise RunnerError(hard_fail)
        raise RunnerError("IRS start page did not transition to legal structure form after begin click")


def _click_download_link(page: Any, timeout_ms: int) -> bool:
    selectors = [
        'a[aria-label*="Download EIN confirmation"]',
        'a:has-text("Download EIN confirmation Letter [PDF]")',
    ]
    if _click_first(page, selectors, timeout_ms):
        return True
    # Fallback: JS-driven click for cases where overlay/offset blocks native click.
    return bool(
        page.evaluate(
            """
            () => {
              const els = Array.from(document.querySelectorAll('a[role="button"], a.irs-button, a'));
              const btn = els.find((a) => {
                const txt = `${a.getAttribute('aria-label') || ''} ${a.textContent || ''}`.toLowerCase();
                return txt.includes('download ein confirmation');
              });
              if (!btn) return false;
              try {
                btn.scrollIntoView({ block: 'center', inline: 'center' });
                ['pointerdown','mousedown','mouseup','click'].forEach((t) =>
                  btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
                );
                return true;
              } catch (_) {
                return false;
              }
            }
            """
        )
    )


def _human_delay(page: Any, config: AppConfig, extra_ms: int = 0) -> None:
    base = max(0, int(config.browser.step_delay_ms))
    jitter = max(0, int(config.browser.step_delay_jitter_ms))
    ms = base + (random.randint(0, jitter) if jitter else 0) + max(0, int(extra_ms))
    # Adaptive speed: if page is already stable, reduce human delay.
    if not (
        _observe_mode_enabled(config)
        and bool(getattr(config.browser, "observe_disable_ready_speedup", False))
    ):
        try:
            ready = bool(page.evaluate("() => document.readyState === 'complete'"))
        except Exception:
            ready = False
        if ready and ms > 0:
            ms = int(ms * 0.45)
    if ms > 0:
        page.wait_for_timeout(ms)


def _observe_mode_enabled(config: AppConfig) -> bool:
    return bool(getattr(config.browser, "observe_mode_active", False))


def _human_fill(page: Any, selector: str, value: str, config: AppConfig, timeout_ms: int) -> None:
    text = str(value or "")
    if not _observe_mode_enabled(config):
        page.fill(selector, text, timeout=timeout_ms)
        return
    page.click(selector, timeout=timeout_ms)
    page.press(selector, "Control+A", timeout=timeout_ms)
    page.press(selector, "Backspace", timeout=timeout_ms)
    if text:
        page.type(selector, text, delay=max(20, int(getattr(config.browser, "observe_type_char_delay_ms", 140))))
    pause_ms = max(0, int(getattr(config.browser, "observe_field_pause_ms", 0)))
    if pause_ms:
        page.wait_for_timeout(pause_ms)


def _human_select_option(page: Any, selector: str, value: str, config: AppConfig, timeout_ms: int) -> None:
    _select_option_retry(page, selector, value, timeout_ms)
    if _observe_mode_enabled(config):
        pause_ms = max(0, int(getattr(config.browser, "observe_field_pause_ms", 0)))
        if pause_ms:
            page.wait_for_timeout(pause_ms)


def _looks_like_transient_goto_error(message: str) -> bool:
    text = str(message or "").lower()
    return any(token in text for token in [
        "ns_error_proxy_forbidden",
        "ns_error_proxy_connection_refused",
        "ns_error_net_interrupt",
        "ns_binding_aborted",
        "net_interrupt",
        "binding_aborted",
        "connection refused",
        "could not connect to proxy",
        "proxyerror",
        "net::",
        "navigation timeout",
        "timeout",
        "timed out",
        "connection reset",
        "connection aborted",
        "temporarily unavailable",
        "econnreset",
        "econnrefused",
    ])


def _goto_with_retry(page: Any, url: str, config: AppConfig) -> None:
    timeout_ms = int(config.browser.timeout_ms)
    waits_ms = [0, 3000, 7000, 12000]
    last_exc: Exception | None = None
    for idx, wait_ms in enumerate(waits_ms, start=1):
        if wait_ms > 0:
            page.wait_for_timeout(wait_ms)
        try:
            page.goto(url, timeout=timeout_ms, wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("domcontentloaded", timeout=min(timeout_ms, 5000))
            except Exception:
                pass
            return
        except Exception as exc:
            last_exc = exc
            if idx >= len(waits_ms) or not _looks_like_transient_goto_error(str(exc)):
                raise
            logger.warning(
                "Initial goto failed (%s/%s), retrying in %.1fs: %s",
                idx,
                len(waits_ms),
                waits_ms[idx] / 1000 if idx < len(waits_ms) else 0,
                exc,
            )
    if last_exc:
        raise last_exc


def _clean_runtime_scalar(value: str) -> str:
    text = str(value or "").strip()
    text = text.replace('\\"', '"').replace("\\'", "'")
    while len(text) >= 2 and ((text[0] == '"' and text[-1] == '"') or (text[0] == "'" and text[-1] == "'")):
        text = text[1:-1].strip()
    return text


def _normalize_proxy_scheme(raw: str) -> str:
    scheme = str(raw or "").strip().lower()
    return scheme if scheme in _SUPPORTED_PROXY_SCHEMES else "http"


def _parse_runtime_proxy_endpoint(host_value: str, port_value: int) -> Tuple[str, str, int, str, str]:
    raw_host = _clean_runtime_scalar(host_value)
    port = int(port_value or 0)
    scheme = "http"
    host = raw_host
    parsed_user = ""
    parsed_pass = ""

    if "://" in raw_host:
        parts = urlsplit(raw_host)
        scheme = _normalize_proxy_scheme(parts.scheme)
        if parts.hostname:
            host = parts.hostname
        elif parts.netloc:
            host = parts.netloc
        if parts.port:
            port = int(parts.port)
        if parts.username:
            parsed_user = unquote(parts.username)
        if parts.password:
            parsed_pass = unquote(parts.password)
    else:
        inline = re.match(r"^(?:([^:@]+):([^@]+)@)?([^:\s]+):(\d+)$", raw_host)
        if inline:
            parsed_user = inline.group(1) or ""
            parsed_pass = inline.group(2) or ""
            host = inline.group(3)
            if port <= 0:
                port = int(inline.group(4))

    host = str(host or "").strip()
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1].strip()
    if not host:
        raise RunnerError("proxy_runtime.host is empty")
    if port <= 0:
        raise RunnerError("proxy_runtime.port must be > 0")
    return scheme, host, port, parsed_user, parsed_pass



def resolve_proxy_endpoint(
    config: AppConfig,
    proxy_code: str,
    runtime_proxy: Optional[Dict[str, Any]] = None,
) -> ProxyEndpoint:
    source = runtime_proxy or {}
    host_value = source.get("host", config.proxy_runtime.host)
    port_value = source.get("port", config.proxy_runtime.port)
    scheme, host, port, parsed_user, parsed_pass = _parse_runtime_proxy_endpoint(
        str(host_value),
        int(port_value or 0),
    )
    username = _clean_runtime_scalar(
        parsed_user or str(source.get("username", config.proxy_runtime.username) or "")
    )
    password = _clean_runtime_scalar(
        parsed_pass or str(source.get("password", config.proxy_runtime.password) or "")
    )
    return ProxyEndpoint(
        proxy_code=proxy_code,
        host=host,
        port=port,
        username=username,
        password=password,
        scheme=scheme,
    )


def pick_proxy_vm(client: ProxyXoayClient, exclude_codes: set[str] | None = None) -> ProxyVm:
    exclude = exclude_codes or set()
    candidates = client.list_inside_proxies()
    for vm in candidates:
        if vm.proxy_code in exclude:
            continue
        return vm
    raise RunnerError("No available proxy VM returned by ProxyXoay")


def rotate_proxy_ip(client: ProxyXoayClient, proxy_code: str, wait_seconds: int) -> ProxyRotationResult:
    try:
        data = client.change_ip([proxy_code])
    except ProxyXoayHttpError as exc:
        if exc.status_code == 400 and exc.wait_seconds:
            return ProxyRotationResult(
                proxy_code=proxy_code,
                status="COOLDOWN",
                message=f"Rotate cooldown: wait {exc.wait_seconds}s",
                new_ip=None,
            )
        raise
    result_items = data.get("data") or []
    if not result_items:
        raise RunnerError(f"ProxyXoay change_ip returned empty data for {proxy_code}")
    item = result_items[0]
    status = str(item.get("status", "UNKNOWN"))
    message = str(item.get("message", ""))
    new_ip = item.get("newIp")

    if wait_seconds > 0:
        time.sleep(wait_seconds)

    return ProxyRotationResult(
        proxy_code=proxy_code,
        status=status,
        message=message,
        new_ip=str(new_ip) if new_ip else None,
    )


def rotate_runtime_ip(rotate_url: str, wait_seconds: int) -> ProxyRotationResult:
    url = str(rotate_url or "").strip()
    # Be tolerant with UI paste artifacts like leading/trailing quotes.
    while len(url) >= 2 and ((url[0] == '"' and url[-1] == '"') or (url[0] == "'" and url[-1] == "'")):
        url = url[1:-1].strip()
    if url.startswith('"') or url.startswith("'"):
        url = url[1:].strip()
    if url.endswith('"') or url.endswith("'"):
        url = url[:-1].strip()
    if not url:
        return ProxyRotationResult(
            proxy_code="RUNTIME",
            status="SKIP",
            message="rotate_url is empty; skip rotate",
            new_ip=None,
        )
    parsed = urlsplit(url)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return ProxyRotationResult(
            proxy_code="RUNTIME",
            status="SKIP",
            message="rotate_url invalid; skip rotate",
            new_ip=None,
        )
    try:
        # Keep rotate endpoint responsive; avoid blocking init for long cooldown windows.
        timeout_s = max(5, min(20, int(wait_seconds or 0)))
        resp = requests.get(url, timeout=timeout_s)
        raw = resp.text[:400]
        payload: Dict[str, Any] = {}
        try:
            payload = resp.json() if resp.text else {}
        except Exception:
            payload = {}

        msg = str(payload.get("message") or raw or f"http {resp.status_code}")
        code = str(payload.get("code", "")).lower()

        if resp.status_code >= 400:
            if "too_many_requests" in code or "try again" in msg.lower():
                return ProxyRotationResult(proxy_code="RUNTIME", status="COOLDOWN", message=msg, new_ip=None)
            return ProxyRotationResult(proxy_code="RUNTIME", status="ERROR", message=msg, new_ip=None)

        status = str(payload.get("status", "")).lower()
        if status in {"error", "failed", "fail"}:
            if "too_many_requests" in code or "try again" in msg.lower():
                return ProxyRotationResult(proxy_code="RUNTIME", status="COOLDOWN", message=msg, new_ip=None)
            return ProxyRotationResult(proxy_code="RUNTIME", status="ERROR", message=msg, new_ip=None)

        return ProxyRotationResult(
            proxy_code="RUNTIME",
            status="SUCCESS",
            message=msg or "rotate ok",
            new_ip=str(payload.get("new_ip") or payload.get("ip") or "") or None,
        )
    except Exception as exc:
        return ProxyRotationResult(proxy_code="RUNTIME", status="ERROR", message=str(exc), new_ip=None)


def check_proxy_health(endpoint: ProxyEndpoint, healthcheck_url: str, timeout: int = 20) -> Tuple[bool, str]:
    scheme = _normalize_proxy_scheme(endpoint.scheme)
    # For requests, socks5h keeps DNS resolution on proxy side and is more stable.
    requests_scheme = "socks5h" if scheme in {"socks5", "socks5h"} else scheme
    username = _clean_runtime_scalar(endpoint.username)
    password = _clean_runtime_scalar(endpoint.password)
    auth = ""
    if username or password:
        auth = f"{quote(username, safe='')}:{quote(password, safe='')}@"
    proxy_url = f"{requests_scheme}://{auth}{endpoint.host}:{endpoint.port}"
    proxies = {
        "http": proxy_url,
        "https": proxy_url,
    }
    urls = [healthcheck_url]

    # Some rotating proxies fail TLS handshake on specific HTTPS targets like ipify.
    parts = urlsplit(healthcheck_url)
    if parts.scheme == "https":
        urls.append(urlunsplit(("http", parts.netloc, parts.path, parts.query, parts.fragment)))

    errors: list[str] = []
    for url in urls:
        try:
            resp = requests.get(url, timeout=timeout, proxies=proxies)
            if resp.status_code >= 400:
                errors.append(f"{url} -> http {resp.status_code}")
                continue
            return True, f"{url} -> {resp.text[:256]}"
        except Exception as exc:  # pragma: no cover
            msg = str(exc)
            if "Missing dependencies for SOCKS support" in msg:
                msg = f"{msg}. Install PySocks."
            errors.append(f"{url} -> {msg}")
    return False, " | ".join(errors)


def capture_page(page: Any, artifact_dir: Path, name: str) -> None:
    ensure_dir(artifact_dir)
    # Avoid forced full-page scrolling in headed mode while automation is filling.
    page.screenshot(path=str(artifact_dir / f"{name}.png"), full_page=False)


def capture_reference_page(page: Any, artifact_dir: Path, name: str) -> None:
    """Capture screenshot + HTML/text snapshot for post-mortem tuning."""
    ensure_dir(artifact_dir)
    capture_page(page, artifact_dir, name)
    try:
        html = page.content()
        (artifact_dir / f"{name}.html").write_text(str(html or ""), encoding="utf-8", errors="ignore")
    except Exception:
        pass
    try:
        text = page.inner_text("body") or ""
        (artifact_dir / f"{name}.txt").write_text(str(text), encoding="utf-8", errors="ignore")
    except Exception:
        pass


def page_blocked(page: Any, keywords: list[str]) -> bool:
    content = page.content().lower()
    for kw in keywords:
        if kw.lower() in content:
            return True
    return False


def _irs_hard_fail_message(page: Any) -> str:
    try:
        body = re.sub(r"\s+", " ", page.inner_text("body") or "").strip()
    except Exception:
        body = ""
    low = body.lower()
    if "attempted too many requests for today" in low:
        return "IRS daily EIN limit reached: attempted too many requests for today."
    if "limited to receipt of one (1) ein per business day" in low:
        return "IRS daily EIN limit reached: one EIN per business day."
    if (
        ("form ss-4" in low or "form ss 4" in low)
        and (
            "fax" in low
            or "mail" in low
            or "submit" in low
            or "must submit" in low
        )
    ):
        return "IRS cannot provide EIN online for this record: submit Form SS-4 by fax or mail."
    if (
        "we are unable to provide you with an ein" in low
        or "unable to provide you with an ein through this online assistant" in low
        or "cannot provide you with an ein online" in low
        or ("unable to complete" in low and "ein" in low and "online" in low)
    ):
        ref = ""
        m = re.search(r"reference number:\s*([0-9]+)", low)
        if m:
            ref = m.group(1)
        if ref:
            return f"IRS cannot provide EIN online for this record (reference {ref})."
        return "IRS cannot provide EIN online for this record."
    if "reference number: 101" in low:
        return "IRS cannot provide EIN online for this record (reference 101)."
    if "reference number: 115" in low:
        return "IRS cannot provide EIN online for this record (reference 115)."
    if "ssn has already" in low and "ein" in low:
        return "IRS SSN rule hit: this SSN has already been used for EIN registration."
    if "ssn/itin has already" in low and "ein" in low:
        return "IRS SSN rule hit: this SSN/ITIN has already been used for EIN registration."
    if "ssn can only be used once" in low:
        return "IRS SSN rule hit: this SSN can only be used once for EIN registration."
    if "ssn/itin can only be used once" in low:
        return "IRS SSN rule hit: this SSN/ITIN can only be used once for EIN registration."
    if "ssn" in low and "already been used" in low and "ein" in low:
        return "IRS SSN rule hit: this SSN has already been used for EIN registration."
    if "ssn/itin" in low and "already been used" in low and "ein" in low:
        return "IRS SSN rule hit: this SSN/ITIN has already been used for EIN registration."
    if "already assigned an ein" in low:
        return "IRS SSN rule hit: responsible party already has an EIN."
    if "already has an ein" in low:
        return "IRS SSN rule hit: responsible party already has an EIN."
    if "already associated with an ein" in low:
        return "IRS SSN rule hit: responsible party already has an EIN."
    if "existing ein" in low and "responsible party" in low:
        return "IRS SSN rule hit: responsible party already has an EIN."
    if "responsible party" in low and "already" in low and "ein" in low:
        return "IRS SSN rule hit: responsible party already used for EIN."
    return ""


def _step_selector(step: WorkflowStep, selectors: Dict[str, str]) -> str:
    if step.selector:
        return step.selector
    if step.field and step.field in selectors:
        return selectors[step.field]
    return ""


def execute_workflow(
    page: Any,
    record: Dict[str, Any],
    config: AppConfig,
    artifact_dir: Path,
) -> Tuple[JobStatus, str, str, Dict[str, str]]:
    last_step = "init"
    confirmation_number = ""

    for step in config.workflow:
        last_step = step.name
        timeout_ms = step.timeout_ms or config.browser.timeout_ms
        selector = _step_selector(step, config.selectors)

        if step.action == "goto":
            target = step.value or config.target_url
            _goto_with_retry(page, target, config)
        elif step.action == "wait_for_selector":
            if not selector:
                raise RunnerError(f"Step {step.name} missing selector")
            page.wait_for_selector(selector, timeout=timeout_ms)
        elif step.action == "fill":
            if not selector:
                raise RunnerError(f"Step {step.name} missing selector")
            value = step.value if step.value else str(record.get(step.field, ""))
            _human_fill(page, selector, value, config, timeout_ms)
        elif step.action == "click":
            if not selector:
                raise RunnerError(f"Step {step.name} missing selector")
            page.click(selector, timeout=timeout_ms)
        elif step.action == "select_option":
            if not selector:
                raise RunnerError(f"Step {step.name} missing selector")
            value = step.value if step.value else str(record.get(step.field, ""))
            _human_select_option(page, selector, value, config, timeout_ms)
        elif step.action == "check_text":
            if step.value and step.value.lower() not in page.content().lower():
                raise RunnerError(f"Step {step.name} expected text not found")
        elif step.action == "screenshot":
            capture_page(page, artifact_dir, step.name)
        elif step.action == "sleep":
            time.sleep(float(step.value or "1"))
        else:
            raise RunnerError(f"Unknown workflow action: {step.action}")

        if step.name in config.capture.checkpoints:
            capture_page(page, artifact_dir, step.name)

        if page_blocked(page, config.browser.block_keywords):
            capture_reference_page(page, artifact_dir, "blocked")
            return JobStatus.MANUAL_REQUIRED, last_step, confirmation_number, {}

    confirm_selector = config.selectors.get("confirmation_number")
    if confirm_selector:
        try:
            confirmation_number = page.inner_text(confirm_selector).strip()
        except Exception:
            confirmation_number = ""

    return JobStatus.SUCCESS, last_step, confirmation_number, {}


def _extract_step6_details(page: Any) -> Dict[str, str]:
    body_text = page.inner_text("body")
    lines = [re.sub(r"\s+", " ", ln.strip()) for ln in body_text.splitlines() if ln.strip()]

    def extract_after_label(*labels: str) -> str:
        label_set = {lb.lower().strip() for lb in labels}
        for idx, line in enumerate(lines):
            low = line.lower().strip()
            if low in label_set and idx + 1 < len(lines):
                return lines[idx + 1].strip()
            for label in label_set:
                if low.startswith(label + " "):
                    return line[len(label):].strip()
        return ""

    def extract_block_after(label: str, max_lines: int = 3) -> str:
        lb = label.lower().strip()
        for idx, line in enumerate(lines):
            if line.lower().strip() == lb:
                chunk = []
                for j in range(idx + 1, min(idx + 1 + max_lines, len(lines))):
                    nxt = lines[j].strip()
                    if re.match(r"^[A-Za-z][A-Za-z /&-]{2,}$", nxt) and j > idx + 1 and nxt.lower() == nxt:
                        break
                    chunk.append(nxt)
                return " | ".join(chunk).strip(" |")
        return ""

    ein_match = re.search(r"\b\d{2}-\d{7}\b", body_text)
    legal_name = extract_after_label("Legal name")
    name_control = extract_after_label("Name control")
    principal_activity = extract_after_label("What your business/organization does")
    principal_product = extract_after_label("Principal product/service")
    reason_for_applying = extract_after_label("Reason for Applying")
    phone_number = extract_after_label("Phone Number")
    county = extract_after_label("County")
    state = extract_after_label("State/Territory")
    start_date = extract_after_label("Start date")
    physical_location = extract_block_after("Physical Location", max_lines=3)
    responsible_name = extract_after_label("Name")
    responsible_ssn = extract_after_label("SSN/ITIN")

    ein_assigned = extract_after_label("EIN assigned")
    if not ein_match and ein_assigned:
        m2 = re.search(r"\b\d{2}-\d{7}\b", ein_assigned)
        if m2:
            ein_match = m2

    return {
        "step6_ein": ein_match.group(0) if ein_match else "",
        "step6_legal_name": legal_name,
        "step6_name_control": name_control,
        "step6_phone_number": phone_number,
        "step6_county": county,
        "step6_state": state,
        "step6_start_date": start_date,
        "step6_principal_activity": principal_activity,
        "step6_principal_product_service": principal_product,
        "step6_reason_for_applying": reason_for_applying,
        "step6_physical_location": physical_location,
        "step6_responsible_name": responsible_name,
        "step6_responsible_ssn_itin": responsible_ssn,
        "step6_raw_text": body_text[:12000],
    }


def execute_ein_form_flow(
    page: Any,
    record: Dict[str, Any],
    config: AppConfig,
    artifact_dir: Path,
    step_callback: Any = None,
) -> Tuple[JobStatus, str, str, Dict[str, str]]:
    timeout_ms = config.browser.timeout_ms
    record_id = _get(record, "record_id") or "row"
    current_step = "init"
    fast_validation_error = _validate_record_fast(record)
    if fast_validation_error:
        return JobStatus.VALIDATION_FAILED, "record_validation", "", {"error_message": fast_validation_error}

    country = _get(record, "country")
    # Some sheets misuse "Country" to store county values (e.g. "Tulsa County").
    # Treat those as county hints and do not block US-only flow.
    if country and not _looks_like_county(country) and not _country_is_us(country):
        return JobStatus.MANUAL_REQUIRED, "validate_country", "", {}

    full_name = _collapse_spaces(_get(record, "NAME", "name"))
    first_name, middle_name, last_name = _split_name(full_name)
    first_name = _sanitize_name_part(first_name)
    middle_name = _sanitize_name_part(middle_name)
    last_name = _sanitize_name_part(last_name)
    ssn = _digits(_get(record, "SSN", "ssn"))
    address = _sanitize_address(_get(record, "ADDRESS", "address"))
    city = _sanitize_city(_get(record, "CITI", "city"))
    state = _get(record, "BANG", "state").upper()
    zip_code = _digits(_get(record, "ZIP", "zip"))
    phone = _digits(_get(record, "Phone", "phone"))
    county_hint = _get(record, "county")
    if not county_hint and _looks_like_county(country):
        county_hint = country
    county = _sanitize_county(_normalize_county(county_hint) or _resolve_county(zip_code, city, state))
    trade_name = _collapse_spaces(_get(record, "TRADE_NAME", "trade_name", "DBA", "dba", "DBA_NAME", "doing_business_as"))
    if not trade_name:
        trade_name = full_name
    trade_name = _sanitize_address(trade_name).upper()
    month = _seed_month(record_id)
    year = "2025"

    try:
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}

        # Step 1
        current_step = "step1_legal_structure"
        if step_callback:
            step_callback(current_step, "running", "Selecting Sole Proprietor...")
        hard_fail = _wait_irs_selector_or_hard_fail(page, 'input[name="legalStructureInput"]', timeout_ms, current_step)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        _human_delay(page, config)
        _ensure_irs_sole_proprietor(page, timeout_ms)
        hard_fail = _wait_irs_selector_or_hard_fail(page, 'input[name="legalStructureInput"]:checked', timeout_ms, current_step)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        # IRS variants sometimes omit these sub-fields on step 1; keep flow resilient.
        _set_checked_if_present(page, 'input[name="solePropStructureInput"][value="SOLE_PROPRIETOR"]', timeout_ms)
        _set_checked_if_present(page, 'input[name="reasonForApplyingInputControl"][value="NEW_BUSINESS"]', timeout_ms)
        if not bool(page.evaluate("""() => {
            const el = document.querySelector('input[name="legalStructureInput"]:checked');
            return !!el;
        }""")):
            raise FlowStepError(current_step, "Legal Structure was not selected before Continue")
        _human_delay(page, config, 150)
        if not _click_first(page, ['button[data-testid="btn-continue"]', 'a[aria-label="Continue"]', 'button[aria-label="Continue"]'], timeout_ms):
            raise FlowStepError(current_step, "Cannot find Continue button on step 1")
        capture_page(page, artifact_dir, "filled")

        # Step 2
        current_step = "step2_identity"
        if step_callback:
            step_callback(current_step, "running", f"Filling identity: {first_name} {last_name}")
        hard_fail = _wait_irs_selector_or_hard_fail(page, 'input[name="responsibleSsn"]', timeout_ms, current_step)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        _human_delay(page, config)
        _human_fill(page, 'input[name="responsibleSsn"]', ssn, config, timeout_ms)
        _human_fill(page, 'input[name="responsibleFirstName"]', first_name, config, timeout_ms)
        _human_fill(page, 'input[name="responsibleMiddleName"]', middle_name, config, timeout_ms)
        _human_fill(page, 'input[name="responsibleLastName"]', last_name, config, timeout_ms)
        _set_checked(page, 'input[name="entityRoleRadioInput"][value="yes"]', timeout_ms)
        _human_delay(page, config, 120)
        if not _click_first(page, ['button[data-testid="btn-continue"]', 'a[aria-label="Continue"]', 'button[aria-label="Continue"]'], timeout_ms):
            raise FlowStepError(current_step, "Cannot find Continue button on step 2")
        step2_error = _fail_fast_after_continue(page, artifact_dir, "step2_validation")
        if step2_error:
            return JobStatus.VALIDATION_FAILED, "step2_validation", "", {"error_message": step2_error}

        # Step 3
        current_step = "step3_addresses"
        if step_callback:
            step_callback(current_step, "running", f"Filling address: {city}, {state}")
        hard_fail = _wait_irs_selector_or_hard_fail(page, 'input[name="physicalStreet"]', timeout_ms, current_step)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        _human_delay(page, config)
        _human_fill(page, 'input[name="physicalStreet"]', address, config, timeout_ms)
        _human_fill(page, 'input[name="physicalCity"]', city, config, timeout_ms)
        _human_select_option(page, 'select[name="physicalState"]', state or "OK", config, timeout_ms)
        _human_fill(page, 'input[name="physicalZipCode"]', zip_code[:5], config, timeout_ms)
        _human_fill(page, 'input[name="thePhone"]', phone[:10], config, timeout_ms)
        _set_checked(page, 'input[name="otherAddress"][value="no"]', timeout_ms)
        _human_delay(page, config, 120)
        if not _click_first(page, ['button[data-testid="btn-continue"]', 'a[aria-label="Continue"]', 'button[aria-label="Continue"]'], timeout_ms):
            raise FlowStepError(current_step, "Cannot find Continue button on step 3")
        step3_error = _fail_fast_after_continue(page, artifact_dir, "step3_validation")
        if step3_error:
            return JobStatus.VALIDATION_FAILED, "step3_validation", "", {"error_message": step3_error}

        # Step 4A details
        current_step = "step4a_additional_details"
        if step_callback:
            step_callback(current_step, "running", f"Filling business details (trade: {trade_name})")
        hard_fail = _wait_irs_any_selector_or_hard_fail(
            page,
            [
                'input[name="dbaNameInput"]',
                'select[name="stateInput"]',
                'input[name="countyInput"]',
            ],
            timeout_ms,
            current_step,
        )
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        _human_delay(page, config)
        _human_fill(page, 'input[name="dbaNameInput"]', trade_name, config, timeout_ms)
        _human_fill_if_present(page, 'input[name="countyInput"]', county or city or "Tulsa", config, timeout_ms)
        _human_select_option(page, 'select[name="stateInput"]', state or "OK", config, timeout_ms)
        _human_select_option(page, 'select[name="startDateMonthInput"]', month, config, timeout_ms)
        _human_fill(page, 'input[name="startDateYearInput"]', year, config, timeout_ms)
        _set_checked(page, 'input[name="highwayVehiclesInput"][value="no"]', timeout_ms)
        _set_checked(page, 'input[name="gamblingWagerInput"][value="no"]', timeout_ms)
        _set_checked(page, 'input[name="fileForm720Input"][value="no"]', timeout_ms)
        _set_checked(page, 'input[name="atfInput"][value="no"]', timeout_ms)
        _set_checked(page, 'input[name="hasEmployeesInput"][value="no"]', timeout_ms)
        _human_delay(page, config, 120)
        if not _click_first(page, ['button[data-testid="btn-continue"]', 'a[aria-label="Continue"]', 'button[aria-label="Continue"]'], timeout_ms):
            raise FlowStepError(current_step, "Cannot find Continue button on step 4A")
        step4a_error = _fail_fast_after_continue(page, artifact_dir, "step4a_validation")
        if step4a_error:
            return JobStatus.VALIDATION_FAILED, "step4a_validation", "", {"error_message": step4a_error}

        # Step 4B activity/services
        current_step = "step4b_business_activity"
        if step_callback:
            step_callback(current_step, "running", "Selecting business activity (Wholesale)...")
        hard_fail = _wait_irs_selector_or_hard_fail(page, 'input[name="entityBusinessCategoryInput"]', timeout_ms, current_step)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        _human_delay(page, config)
        _set_checked(page, 'input[name="entityBusinessCategoryInput"][value="WHOLESALE"]', timeout_ms)
        _set_checked(page, 'input[name="wholeSaleInput"][value="yes"]', timeout_ms)
        _human_fill(page, 'input[name="wholesaleSecondTextInput"]', "fashion", config, timeout_ms)
        _human_delay(page, config, 120)
        if not _click_first(page, ['button[data-testid="btn-continue"]', 'a[aria-label="Continue"]', 'button[aria-label="Continue"]'], timeout_ms):
            raise FlowStepError(current_step, "Cannot find Continue button on step 4B")
        capture_page(page, artifact_dir, "review")

        # Step 5 submit
        current_step = "step5_review_submit"
        if step_callback:
            step_callback(current_step, "running", "Reviewing application and preparing submission...")
        hard_fail = _wait_irs_selector_or_hard_fail(page, 'input[name="confirmationLetterRadioInput"]', timeout_ms, current_step)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        _human_delay(page, config)
        _set_checked(page, 'input[name="confirmationLetterRadioInput"][value="DIGITAL"]', timeout_ms)
        if config.submit_guard.two_step_confirm:
            if not confirm_submit(str(record.get("record_id", "")), config.submit_guard.require_tty):
                return JobStatus.CANCELLED, "confirm_submit", "", {}
        _human_delay(page, config, 200)
        submit_selectors = [
            'button[aria-label="Submit EIN Request"]',
            'a[role="button"][aria-label="Submit EIN Request"]',
            'a[aria-label="Submit EIN Request"]',
            'button[data-testid="btn-continue"]',
            'a[role="button"][aria-label="Continue"]',
            'button:has-text("Submit EIN Request")',
            'a:has-text("Submit EIN Request")',
            'button:has-text("Submit")',
            'a[role="button"]:has-text("Submit")',
        ]
        if not _click_first(page, submit_selectors, timeout_ms):
            # Last resort: find visible action button by text/aria and click.
            js_submit_clicked = bool(
                page.evaluate(
                    """
                    () => {
                      const candidates = Array.from(document.querySelectorAll('button, a[role="button"], a.irs-button'));
                      const target = candidates.find((el) => {
                        const txt = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
                        return txt.includes('submit ein request') || txt.includes('submit');
                      });
                      if (!target) return false;
                      try {
                        ['pointerdown','mousedown','mouseup','click'].forEach((t) =>
                          target.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
                        );
                        return true;
                      } catch (_) {
                        return false;
                      }
                    }
                    """
                )
            )
            if not js_submit_clicked:
                raise FlowStepError(current_step, "Cannot find Submit EIN Request button")
        capture_page(page, artifact_dir, "submitted")

        # Step 6 assignment
        current_step = "step6_ein_assignment"
        if step_callback:
            step_callback(current_step, "running", "Processing EIN assignment & downloading confirmation PDF...")
        page.wait_for_timeout(1200)
        hard_fail = _irs_hard_fail_message(page)
        if hard_fail:
            capture_reference_page(page, artifact_dir, "irs_hard_fail")
            return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
        if page_blocked(page, config.browser.block_keywords):
            capture_reference_page(page, artifact_dir, "blocked")
            return JobStatus.MANUAL_REQUIRED, "blocked", "", {}

        ensure_dir(artifact_dir / "downloads")
        saved_pdf_path = ""
        # Step 6 is critical: keep page alive and retry download capture before leaving.
        download_timeouts = [7000, 10000, 14000]
        for dl_timeout in download_timeouts:
            hard_fail = _irs_hard_fail_message(page)
            if hard_fail:
                capture_reference_page(page, artifact_dir, "irs_hard_fail")
                return JobStatus.VALIDATION_FAILED, "irs_hard_fail", "", {"error_message": hard_fail}
            try:
                with page.expect_download(timeout=dl_timeout) as dl_info:
                    clicked = _click_download_link(page, timeout_ms)
                    if not clicked:
                        raise RunnerError("Download button not clickable")
                dl = dl_info.value
                target = artifact_dir / "downloads" / (dl.suggested_filename or "CP_575_G.pdf")
                dl.save_as(str(target))
                saved_pdf_path = str(target)
                if target.exists() and target.stat().st_size > 0:
                    break
            except Exception:
                page.wait_for_timeout(700)
                continue
        if not saved_pdf_path:
            logger.info("No downloadable PDF event captured for record %s after retries", record_id)

        capture_page(page, artifact_dir, "confirmed")
        meta = _extract_step6_details(page)
        confirmation = meta.get("step6_ein", "")
        meta["pdf_path"] = saved_pdf_path
        return JobStatus.SUCCESS, "confirmed", confirmation, meta
    except FlowStepError:
        capture_reference_page(page, artifact_dir, f"error_{current_step}")
        raise
    except Exception as exc:
        capture_reference_page(page, artifact_dir, f"error_{current_step}")
        visible_error = _extract_visible_error(page)
        message = visible_error or str(exc)
        if visible_error and str(exc) and visible_error.lower() not in str(exc).lower():
            message = f"{visible_error} | runtime: {exc}"
        raise FlowStepError(current_step, message) from exc


def confirm_submit(record_id: str, require_tty: bool = True) -> bool:
    if require_tty and not sys.stdin.isatty():
        return False

    print(f"[CONFIRM-1] record_id={record_id}")
    first = input("Type record_id to continue submit: ").strip()
    if first != record_id:
        return False

    second = input("Type SUBMIT to confirm final action: ").strip().upper()
    return second == "SUBMIT"


def run_single_attempt(
    config: AppConfig,
    record: Dict[str, Any],
    proxy_endpoint: ProxyEndpoint,
    artifact_dir: Path,
    use_proxy: bool = True,
    step_callback: Any = None,
) -> Tuple[JobStatus, str, str, str, Dict[str, str]]:
    """
    Returns: (status, last_step, error_message, confirmation_number, metadata)
    """
    if use_proxy:
        if config.proxy_runtime.skip_healthcheck:
            ok, health = True, "skipped"
        else:
            ok, health = check_proxy_health(proxy_endpoint, config.proxy_runtime.healthcheck_url)
        if not ok:
            return JobStatus.RETRYABLE_FAIL, "proxy_healthcheck", f"Proxy healthcheck failed: {health}", "", {}

    try:
        import camoufox.locale
        camoufox.locale.geoip_allowed = lambda: None
    except Exception:
        pass

    try:
        from camoufox.sync_api import Camoufox
    except ImportError:
        return JobStatus.RETRYABLE_FAIL, "bootstrap", "Missing dependency: camoufox", "", {}

    proxy = None
    if use_proxy:
        proxy = {
            "server": proxy_endpoint.server,
            "username": proxy_endpoint.username,
            "password": proxy_endpoint.password,
        }

    try:
        effective_headless = bool(config.browser.headless or config.browser.force_background_headless)
        launch_kwargs = {
            "headless": effective_headless,
            "firefox_user_prefs": {
                "layers.acceleration.disabled": True,
                "gfx.direct2d.disabled": True,
            },
        }
        if not effective_headless:
            launch_kwargs["window"] = (config.browser.manual_window_width, config.browser.manual_window_height)
        if proxy:
            launch_kwargs["proxy"] = proxy
            launch_kwargs["geoip"] = False
        with Camoufox(**launch_kwargs) as browser:
            if effective_headless:
                context = browser.new_context(
                    accept_downloads=True,
                    viewport={"width": 1366, "height": 1702},
                    screen={"width": 1366, "height": 1702},
                )
            else:
                context = browser.new_context(
                    accept_downloads=True,
                    no_viewport=True,
                )
            page = context.new_page()
            # Keep zoom stable on Windows high-DPI so click coordinates match layout.
            if not effective_headless:
                page.evaluate("document.documentElement.style.zoom = '100%'")
            if step_callback:
                step_callback("browser_open", "running", "Navigating to IRS portal...")
            _goto_with_retry(page, config.target_url, config)
            capture_page(page, artifact_dir, "loaded")

            if "applyein" in config.target_url.lower() or "ein-sandbox.test" in config.target_url.lower():
                status, last_step, confirmation, metadata = execute_ein_form_flow(page, record, config, artifact_dir, step_callback=step_callback)
            else:
                status, last_step, confirmation, metadata = execute_workflow(page, record, config, artifact_dir)
            if status != JobStatus.SUCCESS:
                if status == JobStatus.CANCELLED:
                    return status, last_step, "Submit confirmation rejected", confirmation, metadata
                if status == JobStatus.MANUAL_REQUIRED and last_step == "validate_country":
                    return status, last_step, "Country is not US; manual required", confirmation, metadata
                if status == JobStatus.VALIDATION_FAILED:
                    detail = str((metadata or {}).get("error_message", "") or "").strip()
                    if not detail:
                        detail = "Validation failed"
                    return status, last_step, detail, confirmation, metadata
                return status, last_step, "Blocked or captcha detected", confirmation, metadata

            return JobStatus.SUCCESS, last_step, "", confirmation, metadata
    except FlowStepError as exc:
        logger.warning("Run attempt failed at step %s: %s", exc.step, exc.message)
        return JobStatus.RETRYABLE_FAIL, exc.step, exc.message, "", {}
    except Exception as exc:
        logger.exception("Run attempt failed")
        return JobStatus.RETRYABLE_FAIL, "runtime", str(exc), "", {}
