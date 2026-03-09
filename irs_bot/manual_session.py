from __future__ import annotations

import logging
import json
import re
import time
from pathlib import Path
from typing import Any

from .config import AppConfig
from .logging_utils import ensure_dir, utc_now
from .proxyxoay_client import ProxyXoayClient
from .runner import check_proxy_health, pick_proxy_vm, resolve_proxy_endpoint, rotate_proxy_ip

logger = logging.getLogger(__name__)


class ManualSessionError(RuntimeError):
    pass


MANUAL_SAVE_SCRIPT = r"""
(() => {
  if (window.top !== window) return;
  if (document.getElementById('__irs_manual_save_btn')) return;

  const btn = document.createElement('button');
  btn.id = '__irs_manual_save_btn';
  btn.type = 'button';
  btn.textContent = 'Save Web';
  btn.title = 'Save current HTML snapshot';
  Object.assign(btn.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #0b5ed7',
    background: '#0d6efd',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  });
  btn.addEventListener('click', () => {
    if (typeof window.__irsManualSaveSnapshot === 'function') {
      window.__irsManualSaveSnapshot();
    }
  });
  document.documentElement.appendChild(btn);

  const getActionNode = (el) => {
    if (!el) return null;
    return el.closest('button, input[type="submit"], input[type="button"], a[role="button"], a, [role="button"]');
  };

  const shouldCaptureBeforeNav = (node) => {
    if (!node) return false;
    const aria = (node.getAttribute('aria-label') || '').toLowerCase().trim();
    if (/(^|\\s)(continue|next|submit|review|assign|confirm|finish|complete)(\\s|$)/.test(aria)) return true;
    const txt = ((node.innerText || node.value || aria || '') + '').toLowerCase().trim();
    return /(continue|next|submit|review|assign|confirm|finish|complete)/.test(txt);
  };

  const captureSoon = async (reason) => {
    if (typeof window.__irsManualSaveSnapshotReason !== 'function') return;
    try {
      await window.__irsManualSaveSnapshotReason(reason);
    } catch (_) {}
  };

  const gateAndCapture = (ev, reason) => {
    const node = getActionNode(ev.target);
    if (!shouldCaptureBeforeNav(node)) return;
    if (node.dataset.irsBypassOnce === '1') {
      node.dataset.irsBypassOnce = '';
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    (async () => {
      await Promise.race([
        captureSoon(reason),
        new Promise((r) => setTimeout(r, 2200)),
      ]);
      try {
        node.dataset.irsBypassOnce = '1';
        node.click();
      } catch (_) {}
    })();
  };

  document.addEventListener('click', (ev) => gateAndCapture(ev, 'before_continue_click'), true);
  document.addEventListener('pointerdown', (ev) => {
    const node = getActionNode(ev.target);
    if (shouldCaptureBeforeNav(node)) captureSoon('before_continue_pointerdown');
  }, true);
  document.addEventListener('mousedown', (ev) => {
    const node = getActionNode(ev.target);
    if (shouldCaptureBeforeNav(node)) captureSoon('before_continue_mousedown');
  }, true);

  document.addEventListener('submit', () => {
    captureSoon('before_form_submit');
  }, true);

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    captureSoon('before_enter_submit');
  }, true);

  let formSaveTimer = null;
  const scheduleFormSave = () => {
    if (formSaveTimer) clearTimeout(formSaveTimer);
    formSaveTimer = setTimeout(() => {
      captureSoon('form_change');
    }, 700);
  };
  document.addEventListener('input', scheduleFormSave, true);
  document.addEventListener('change', scheduleFormSave, true);
})();
"""



def _safe_name(value: str) -> str:
    out = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip())
    return out[:80] if out else "page"



def _snapshot_html(page: Any, snapshot_dir: Path, idx: int, reason: str) -> None:
    ensure_dir(snapshot_dir)
    timestamp = utc_now().replace(":", "-")
    url = page.url or "about_blank"
    base = f"{idx:04d}_{_safe_name(reason)}_{_safe_name(url)}_{timestamp}"
    html_path = snapshot_dir / f"{base}.html"
    meta_path = snapshot_dir / f"{base}.meta.txt"
    png_path = snapshot_dir / f"{base}.png"
    form_path = snapshot_dir / f"{base}.form.json"

    html = page.content()
    html_path.write_text(html, encoding="utf-8")
    meta_path.write_text(f"time={utc_now()}\nurl={url}\nreason={reason}\n", encoding="utf-8")
    try:
        form_state = page.evaluate(
            """
            () => {
              const out = {};
              const fields = Array.from(document.querySelectorAll('input, textarea, select'));
              for (const el of fields) {
                const key = el.name || el.id || el.getAttribute('aria-label') || `${el.tagName.toLowerCase()}_${fields.indexOf(el)}`;
                let value = '';
                if (el.type === 'checkbox' || el.type === 'radio') {
                  value = !!el.checked;
                } else if (el.tagName === 'SELECT') {
                  value = Array.from(el.selectedOptions || []).map(o => o.value);
                } else {
                  value = el.value;
                }
                out[key] = {
                  tag: el.tagName.toLowerCase(),
                  type: (el.type || '').toLowerCase(),
                  value: value,
                };
              }
              return out;
            }
            """
        )
        form_path.write_text(json.dumps(form_state, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass
    try:
        page.screenshot(path=str(png_path), full_page=True)
    except Exception:
        # Some pages may block screenshot in transient states; keep HTML/meta capture.
        pass



def _has_placeholder_auth(config: AppConfig) -> bool:
    auth = config.proxyxoay.auth
    if not auth:
        return True
    vals = [auth.username, auth.password, auth.login_endpoint]
    for v in vals:
        if "YOUR_PROXYXOAY" in v:
            return True
    return False



def run_manual_session(
    config: AppConfig,
    start_url: str | None = None,
    snapshot_dir: str | Path = "artifacts/manual",
    skip_rotate: bool = False,
) -> None:
    rotate = None
    proxy_code = "manual-no-rotate"
    if not skip_rotate:
        if _has_placeholder_auth(config):
            raise ManualSessionError(
                "proxyxoay.auth still has placeholder values. Update config with real API login first."
            )
        client = ProxyXoayClient(config.proxyxoay)
        vm = pick_proxy_vm(client)
        proxy_code = vm.proxy_code
        rotate = rotate_proxy_ip(client, proxy_code, wait_seconds=config.proxy_runtime.change_ip_wait_seconds)
        if rotate.status.upper() != "SUCCESS":
            raise ManualSessionError(f"Rotate IP failed for {proxy_code}: {rotate.message}")

    endpoint = resolve_proxy_endpoint(config, proxy_code)
    if config.proxy_runtime.skip_healthcheck:
        ok, health = True, "skipped"
    else:
        ok, health = check_proxy_health(endpoint, config.proxy_runtime.healthcheck_url)
    if not ok:
        raise ManualSessionError(f"Proxy healthcheck failed: {health}")

    logger.info(
        "Manual session proxy_code=%s new_ip=%s skip_rotate=%s",
        proxy_code,
        rotate.new_ip if rotate else "not-rotated",
        skip_rotate,
    )

    try:
        from camoufox.sync_api import Camoufox
    except ImportError as exc:
        raise ManualSessionError("Missing dependency: camoufox") from exc

    proxy = {
        "server": endpoint.server,
        "username": endpoint.username,
        "password": endpoint.password,
    }

    out_dir = Path(snapshot_dir) / f"manual-{int(time.time())}-{proxy_code}"
    ensure_dir(out_dir)
    downloads_dir = out_dir / "downloads"
    ensure_dir(downloads_dir)

    launch_window = (config.browser.manual_window_width, config.browser.manual_window_height)
    with Camoufox(headless=False, proxy=proxy, window=launch_window) as browser:
        context = browser.new_context(
            accept_downloads=True,
            no_viewport=True,
        )
        page = context.new_page()
        page.evaluate("document.documentElement.style.zoom = '100%'")

        counter = {"n": 0}
        download_counter = {"n": 0}
        net_snap = {"t": 0.0}

        def snap(reason: str) -> None:
            counter["n"] += 1
            _snapshot_html(page, out_dir, counter["n"], reason)
            logger.info("Saved snapshot #%s reason=%s", counter["n"], reason)

        def on_load() -> None:
            snap("load")

        def on_dom() -> None:
            snap("domcontentloaded")

        def on_frame(frame: Any) -> None:
            if frame == page.main_frame:
                snap("framenavigated")

        def on_download(download: Any) -> None:
            download_counter["n"] += 1
            name = download.suggested_filename or f"download-{download_counter['n']}"
            filename = f"{download_counter['n']:04d}_{_safe_name(name)}"
            target = downloads_dir / filename
            try:
                download.save_as(str(target))
                logger.info("Saved download #%s -> %s", download_counter["n"], target)
                print(f"[download] saved: {target}")
            except Exception as exc:  # pragma: no cover
                logger.warning("Failed to save download %s: %s", name, exc)
                print(f"[download] failed: {name} ({exc})")

        def on_request(request: Any) -> None:
            try:
                now = time.monotonic()
                # Main-frame navigation
                if request.is_navigation_request() and request.frame == page.main_frame:
                    snap("before_navigation_request")
                    net_snap["t"] = now
                    return

                # Many IRS step transitions happen via fetch/xhr, not hard navigation.
                if request.frame != page.main_frame:
                    return
                if request.resource_type not in {"xhr", "fetch", "document"}:
                    return
                if now - net_snap["t"] < 1.2:
                    return
                url = (request.url or "").lower()
                if "/applyein/" not in url and "irs.gov" not in url:
                    return
                snap("before_step_request")
                net_snap["t"] = now
            except Exception:
                pass

        context.expose_function("__irsManualSaveSnapshot", lambda: snap("manual_button"))
        context.expose_function("__irsManualSaveSnapshotReason", lambda reason: snap(str(reason or "manual_reason")))
        page.add_init_script(MANUAL_SAVE_SCRIPT)
        page.on("load", lambda: on_load())
        page.on("domcontentloaded", lambda: on_dom())
        page.on("framenavigated", on_frame)
        page.on("download", on_download)
        page.on("request", on_request)

        first_url = start_url or config.target_url
        page.goto(first_url, timeout=config.browser.timeout_ms)
        snap("session_start")

        print("Manual session started.")
        print(f"Proxy code: {proxy_code}")
        print(f"Rotate mode: {'skip' if skip_rotate else 'change-ip'}")
        print(f"Proxy health: {health}")
        print(f"Snapshots dir: {out_dir}")
        print(f"Downloads dir: {downloads_dir}")
        print("Injected button: Save Web (bottom-right) for manual HTML snapshot.")
        print(f"Auto-save interval: {config.browser.manual_autosave_seconds}s")
        print("Interact with browser manually. Press Ctrl+C to stop session.")

        last_url = page.url
        autosave_interval = max(0.2, float(config.browser.manual_autosave_seconds))
        last_autosave = time.monotonic()
        try:
            while True:
                time.sleep(0.2)
                if page.is_closed():
                    break
                now = time.monotonic()
                if now - last_autosave >= autosave_interval:
                    snap("autosave_tick")
                    last_autosave = now
                if page.url != last_url:
                    last_url = page.url
                    snap("url_change")
        except KeyboardInterrupt:
            pass

        if not page.is_closed():
            snap("session_end")
        context.close()

    print(f"Manual session ended. Snapshots saved to: {out_dir}")
