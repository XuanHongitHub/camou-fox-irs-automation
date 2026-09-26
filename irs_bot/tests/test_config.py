from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from irs_bot.config import AppConfig, ConfigError, load_config


class ConfigTests(unittest.TestCase):
    def test_load_config_success(self) -> None:
        try:
            import yaml  # noqa: F401
        except ImportError:
            self.skipTest("pyyaml not installed")

        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "config.yml"
            path.write_text(
                """
                target_url: "https://example.com"
                required_columns: [record_id, legal_structure]
                proxyxoay:
                  base_url: "https://id.proxyxoay.net"
                  auth:
                    login_endpoint: "/api/v1/auth/login"
                    username: "u"
                    password: "p"
                proxy_runtime:
                  host: "proxy.example"
                  port: 8178
                  username: "x"
                  password: "y"
                  proxy_list:
                    - enabled: true
                      host: "http://proxy-a.example"
                      port: 9001
                      username: "a"
                      password: "b"
                """,
                encoding="utf-8",
            )
            cfg = load_config(path)
            self.assertIsInstance(cfg, AppConfig)
            self.assertEqual(cfg.proxy_runtime.port, 8178)
            self.assertEqual(len(cfg.proxy_runtime.proxy_list), 1)
            self.assertEqual(cfg.proxy_runtime.proxy_list[0]["host"], "http://proxy-a.example")

    def test_load_config_missing_file(self) -> None:
        with self.assertRaises(ConfigError):
            load_config("/tmp/not-found-config.yml")


if __name__ == "__main__":
    unittest.main()
