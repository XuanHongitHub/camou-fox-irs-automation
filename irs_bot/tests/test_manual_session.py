from __future__ import annotations

import unittest

from irs_bot.config import AppConfig, ProxyRuntimeConfig, ProxyXoayAuthConfig, ProxyXoayConfig
from irs_bot.manual_session import _has_placeholder_auth, _safe_name


class ManualSessionTests(unittest.TestCase):
    def test_safe_name(self) -> None:
        self.assertEqual(_safe_name("https://a.com/x y"), "https_a.com_x_y")

    def test_placeholder_auth_detected(self) -> None:
        cfg = AppConfig(
            target_url="https://example.com",
            required_columns=["record_id"],
            proxyxoay=ProxyXoayConfig(
                base_url="https://id.proxyxoay.net",
                auth=ProxyXoayAuthConfig(
                    login_endpoint="/api/v1/auth/login",
                    username="YOUR_PROXYXOAY_USERNAME",
                    password="YOUR_PROXYXOAY_PASSWORD",
                ),
            ),
            proxy_runtime=ProxyRuntimeConfig(
                host="proxy",
                port=8178,
                username="u",
                password="p",
            ),
        )
        self.assertTrue(_has_placeholder_auth(cfg))


if __name__ == "__main__":
    unittest.main()
