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
from .runner import _goto_with_retry, check_proxy_health, pick_proxy_vm, resolve_proxy_endpoint, rotate_proxy_ip, rotate_runtime_ip

logger = logging.getLogger(__name__)

try:
    import camoufox.locale
    camoufox.locale.geoip_allowed = lambda: None
except Exception:
    pass


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
    if str(auth.access_token or "").strip():
        return False
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
    direct: bool = False,
) -> None:
    rotate = None
    proxy_code = "manual-no-rotate"
    rotate_url = str(getattr(config.proxy_runtime, "rotate_url", "") or "").strip()
    if direct:
        skip_rotate = True
    if not skip_rotate and not direct:
        if rotate_url:
            proxy_code = "manual-runtime-rotate"
            rotate = rotate_runtime_ip(rotate_url, wait_seconds=config.proxy_runtime.change_ip_wait_seconds)
            if rotate.status.upper() not in {"SUCCESS", "SKIPPED"}:
                raise ManualSessionError(f"Runtime rotate failed for manual session: {rotate.message}")
        else:
            if _has_placeholder_auth(config):
                raise ManualSessionError(
                    "Manual rotate requires either proxy_runtime.rotate_url or real proxyxoay auth/access_token."
                )
            client = ProxyXoayClient(config.proxyxoay)
            vm = pick_proxy_vm(client)
            proxy_code = vm.proxy_code
            rotate = rotate_proxy_ip(client, proxy_code, wait_seconds=config.proxy_runtime.change_ip_wait_seconds)
            if rotate.status.upper() != "SUCCESS":
                raise ManualSessionError(f"Rotate IP failed for {proxy_code}: {rotate.message}")

    endpoint = None
    health = "direct"
    if not direct:
        endpoint = resolve_proxy_endpoint(config, proxy_code)
        if config.proxy_runtime.skip_healthcheck:
            ok, health = True, "skipped"
        else:
            ok, health = check_proxy_health(endpoint, config.proxy_runtime.healthcheck_url)
        if not ok:
            raise ManualSessionError(f"Proxy healthcheck failed: {health}")

    logger.info(
        "Manual session direct=%s proxy_code=%s new_ip=%s skip_rotate=%s",
        direct,
        proxy_code,
        rotate.new_ip if rotate else "not-rotated",
        skip_rotate,
    )

    try:
        from camoufox.sync_api import Camoufox
    except ImportError as exc:
        raise ManualSessionError("Missing dependency: camoufox") from exc

    proxy = None
    if endpoint is not None:
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
    launch_kwargs: dict[str, Any] = {
        "headless": False,
        "window": launch_window,
    }
    if proxy:
        launch_kwargs["proxy"] = proxy
        launch_kwargs["geoip"] = False
    with Camoufox(**launch_kwargs) as browser:
        context = browser.new_context(
            accept_downloads=True,
            no_viewport=True,
        )
        page = context.new_page()
        page.evaluate("document.documentElement.style.zoom = '100%'")

        download_counter = {"n": 0}
        snapshot_counter = {"n": 0}

        def snap(reason: str) -> None:
            snapshot_counter["n"] += 1
            _snapshot_html(page, out_dir, snapshot_counter["n"], reason)
            logger.info("Saved snapshot #%s reason=%s", snapshot_counter["n"], reason)

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

        context.expose_function("__irsManualSaveSnapshot", lambda: snap("manual_button"))
        page.add_init_script(MANUAL_SAVE_SCRIPT)
        page.on("download", on_download)

        first_url = start_url or config.target_url
        startup_error = ""
        try:
            _goto_with_retry(page, first_url, config)
        except Exception as exc:
            startup_error = str(exc)
            logger.warning("Manual initial goto failed, keeping browser open for inspection: %s", startup_error)
            try:
                page.goto("about:blank", timeout=min(config.browser.timeout_ms, 3000))
            except Exception:
                pass

        print("Manual session started.")
        print(f"Mode: {'direct-browser' if direct else 'proxy-browser'}")
        print(f"Proxy code: {proxy_code}")
        print(f"Rotate mode: {'skip' if skip_rotate else 'change-ip'}")
        print(f"Proxy health: {health}")
        print(f"Snapshots dir: {out_dir}")
        print(f"Downloads dir: {downloads_dir}")
        print("Injected button: Save Web (bottom-right) for manual snapshot on demand.")
        if startup_error:
            print(f"Initial IRS open failed: {startup_error}")
            print(f"Try opening manually in this browser: {first_url}")
        print("Interact with browser manually. Press Ctrl+C to stop session.")

        try:
            while True:
                time.sleep(0.2)
                if page.is_closed():
                    break
        except KeyboardInterrupt:
            pass

        if not page.is_closed():
            snap("session_end")
        context.close()

    print(f"Manual session ended. Snapshots saved to: {out_dir}")
