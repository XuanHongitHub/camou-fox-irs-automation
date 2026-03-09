from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests

from .config import ProxyXoayConfig

logger = logging.getLogger(__name__)


class ProxyXoayError(RuntimeError):
    pass


class ProxyXoayHttpError(ProxyXoayError):
    def __init__(self, status_code: int, endpoint: str, message: str, response_text: str = "", wait_seconds: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code
        self.endpoint = endpoint
        self.response_text = response_text
        self.wait_seconds = wait_seconds


@dataclass
class ProxyVm:
    id: str
    name: str
    status: str
    ip: str
    raw: Dict[str, Any]

    @property
    def proxy_code(self) -> str:
        # ProxyXoay responses can vary by product type; keep fallbacks.
        for k in ("proxyCode", "code", "vmCode", "name"):
            v = self.raw.get(k)
            if v:
                return str(v)
        return self.name


class ProxyXoayClient:
    def __init__(self, cfg: ProxyXoayConfig, timeout: int = 30):
        self.cfg = cfg
        self.timeout = timeout
        self.base_url = cfg.base_url if cfg.base_url.startswith("http") else f"https://{cfg.base_url}"
        self.session = requests.Session()
        self.token: Optional[str] = (cfg.auth.access_token.strip() if cfg.auth and cfg.auth.access_token else None)

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Accept": "*/*",
            "Content-Type": "application/json",
            "TimeZone": self.cfg.timezone,
            "X-Tenant": self.cfg.tenant,
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def login(self) -> str:
        if self.token:
            return self.token
        if not self.cfg.auth:
            raise ProxyXoayError("proxyxoay.auth config is required")
        endpoint = self.cfg.auth.login_endpoint
        url = urljoin(self.base_url + "/", endpoint.lstrip("/"))
        payload = {
            "username": self.cfg.auth.username,
            "password": self.cfg.auth.password,
        }
        resp = self.session.post(url, json=payload, headers=self._headers(), timeout=self.timeout)
        if resp.status_code >= 400:
            raise ProxyXoayError(f"ProxyXoay login failed [{resp.status_code}]: {resp.text[:240]}")
        data = resp.json()

        # Support common token response shapes.
        token = data.get("access_token") or data.get("token")
        if not token and isinstance(data.get("data"), dict):
            token = data["data"].get("access_token") or data["data"].get("token")
        if not token:
            raise ProxyXoayError("ProxyXoay login response missing access token")

        self.token = token
        logger.info("ProxyXoay login success")
        return token

    def _request(self, method: str, endpoint: str, payload: Dict[str, Any] | List[Any] | None = None) -> Any:
        url = urljoin(self.base_url + "/", endpoint.lstrip("/"))
        if not self.token:
            self.login()

        resp = None
        for attempt in range(1, 4):
            resp = self.session.request(
                method=method,
                url=url,
                json=payload,
                headers=self._headers(),
                timeout=self.timeout,
            )
            if resp.status_code not in (502, 503, 504):
                break
            if attempt < 3:
                time.sleep(0.8 * attempt)

        if resp.status_code == 401:
            self.login()
            resp = self.session.request(
                method=method,
                url=url,
                json=payload,
                headers=self._headers(),
                timeout=self.timeout,
            )

        if resp.status_code >= 400:
            text = (resp.text or "").strip()
            wait_seconds: Optional[int] = None
            if text.lower().startswith("<!doctype html") or "<html" in text[:120].lower():
                text = "Upstream gateway returned HTML error page (possible temporary outage/Cloudflare)."
            else:
                # Try parsing JSON payload for provider-friendly messages.
                try:
                    data = resp.json()
                    if isinstance(data, dict):
                        msg = str(data.get("message", "") or "").strip()
                        if msg:
                            text = msg
                except Exception:
                    pass
                m = re.search(r"(\d+)\s*gi(?:\u00e2|a)y", text, flags=re.IGNORECASE)
                if not m:
                    m = re.search(r"wait\s*(\d+)\s*sec", text, flags=re.IGNORECASE)
                if m:
                    wait_seconds = int(m.group(1))
            raise ProxyXoayHttpError(
                status_code=resp.status_code,
                endpoint=endpoint,
                message=f"ProxyXoay request failed [{resp.status_code}] {endpoint}: {text[:240]}",
                response_text=text,
                wait_seconds=wait_seconds,
            )
        return resp.json()

    @staticmethod
    def _items_from_payload(data: Any) -> List[Dict[str, Any]]:
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        if isinstance(data, dict):
            nested = data.get("data")
            if isinstance(nested, list):
                return [x for x in nested if isinstance(x, dict)]
            if isinstance(nested, dict):
                rows = nested.get("data")
                if isinstance(rows, list):
                    return [x for x in rows if isinstance(x, dict)]
                return [nested]
            return [data]
        return []

    def list_inside_proxies(
        self,
        *,
        current_page: int = 1,
        record_per_page: int = 50,
        field_sorted: str = "_id",
        type_sorted: str = "desc",
        keyword: str = "",
        keyword_type: str = "",
        region_code: Optional[str] = None,
        node_code: Optional[str] = None,
        template_code: Optional[str] = None,
    ) -> List[ProxyVm]:
        payload: Dict[str, Any] = {
            "currentPage": current_page,
            "recordPerPage": record_per_page,
            "ips": [],
            "keyword": keyword,
            "keywordType": keyword_type,
            "fieldSorted": field_sorted,
            "typeSorted": type_sorted,
            "regionCode": region_code,
            "nodeCode": node_code,
            "templateCode": template_code,
            "vmType": self.cfg.vm_type,
            "typeSearch": self.cfg.type_search,
        }
        data = self._request("POST", "/api/v1/inside-proxies/pageable", payload)
        items = self._items_from_payload(data)
        output: List[ProxyVm] = []
        for raw in items:
            output.append(
                ProxyVm(
                    id=str(raw.get("id", "")),
                    name=str(raw.get("name", "")) or str(raw.get("code", "")) or str(raw.get("proxyCode", "")),
                    status=str(raw.get("status", "UNKNOWN")),
                    ip=str(raw.get("ip", "")) or str(raw.get("ipv4", "")),
                    raw=raw,
                )
            )
        return output

    def count_inside_proxies(self, *, current_page: int = 1, record_per_page: int = 50) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "currentPage": current_page,
            "recordPerPage": record_per_page,
            "ips": [],
            "keyword": "",
            "keywordType": "",
            "fieldSorted": "_id",
            "typeSorted": "desc",
            "regionCode": None,
            "nodeCode": None,
            "templateCode": None,
            "vmType": self.cfg.vm_type,
            "typeSearch": self.cfg.type_search,
        }
        return self._request("POST", "/api/v1/inside-proxies/countable", payload)

    def renew_now_multiple(self, vm_codes: List[str]) -> Dict[str, Any]:
        return self._request("POST", "/api/v1/inside-proxies/renew-now-multiple", vm_codes)

    def change_ip(self, proxy_codes: List[str]) -> Dict[str, Any]:
        payload = {"codes": proxy_codes}
        return self._request("PUT", "/api/v1/api-proxies/api-proxy-4g/change-ip", payload)
