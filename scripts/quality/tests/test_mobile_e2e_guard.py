"""Tests for qa/mobile/scripts/e2e_guard.py: the native-E2E backend isolation contract (TS-QA-103, AC-002)."""
import importlib.util
import os
import re
import unittest
import unittest.mock
from pathlib import Path

GUARD = Path(__file__).resolve().parents[3] / "qa" / "mobile" / "scripts" / "e2e_guard.py"


def load():
    spec = importlib.util.spec_from_file_location("e2e_guard", GUARD)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


g = load()
OK = "postgresql://postgres@localhost:5544/trackspense_e2e_ios_123"


class ValidateDatabaseUrl(unittest.TestCase):
    def test_accepts_local_disposable_databases(self):
        for url in (
            OK,
            "postgresql://u:p@127.0.0.1:5432/trackspense_e2e_android_9",
            "postgresql://u@localhost/trackspense_e2e_x",
            "postgresql://postgres:s3cr3t-Hex.0~%2F@127.0.0.1:54321/trackspense_e2e_ios_9",
            "postgresql://u@[::1]:5432/trackspense_e2e_x",
            "postgresql+psycopg2://u@localhost:5432/trackspense_e2e_x",
        ):
            with self.subTest(url=url):
                self.assertEqual(g.validate_database_url(url), url)

    def test_refuses_anything_else(self):
        for url in (
            "",
            "sqlite:///x.db",
            "postgresql://u:p@db.example.com:5432/trackspense_e2e_x",  # remote host
            "postgresql://u:p@10.0.0.5:5432/trackspense_e2e_x",  # LAN host
            "postgresql://u:p@localhost.evil.test:5432/trackspense_e2e_x",
            "postgresql://u@localhost:5432/trackspense_dev",  # developer DB
            "postgresql://u@localhost:5432/trackspense_qa",  # web QA DB
            "postgresql://u@localhost:5432/postgres",
            "postgresql://u@localhost:5432/trackspense_e2e_",  # empty suffix
            "postgresql://u@localhost:5432/TRACKSPENSE_E2E_x",
            "postgresql://u@localhost:5432/trackspense_e2e_x;drop",
            "postgresql://u@/trackspense_e2e_x?host=db.example.com",  # host smuggled in query
            "postgresql://u@localhost/trackspense_e2e_x?host=db.example.com",
            # libpq/SQLAlchemy query parameters can override the host, address, database or credentials
            "postgresql://localhost/trackspense_e2e_x?dbname=prod",
            "postgresql://localhost/trackspense_e2e_x?hostaddr=203.0.113.9&dbname=prod",
            "postgresql://localhost/trackspense_e2e_x?service=prod",
            "postgresql://localhost/trackspense_e2e_x?HOST=evil.com",
            "postgresql://localhost/trackspense_e2e_x?options=-csearch_path%3Dprod",
            "postgresql://localhost/trackspense_e2e_x?sslmode=disable",
            "postgresql://u@/trackspense_e2e_x?host=/tmp/pgsock",
            "postgresql://u@/trackspense_e2e_x?host=/tmp,db.example.com",
            # multi-host netloc: urlsplit sees only the first host, libpq tries them all
            "postgresql://localhost:5432,evil.example.com:5432/trackspense_e2e_x",
            "postgresql://evil.example.com,localhost/trackspense_e2e_x",
            # trailing newline / control characters / whitespace / unicode digits / fragments
            "postgresql://u@localhost:5432/trackspense_e2e_x\n",
            "postgresql://u@localhost:5432/trackspense_e2e_x ",
            "postgresql://u@localhost:5432/trackspense_e2e_x\x00",
            "postgresql://u@localhost:\u0661\u0662\u0663\u0664/trackspense_e2e_x",
            "postgresql://u@localhost:5432/trackspense_e2e_x#frag",
            "postgresql://u@localhost:5432/trackspense_e2e_x/extra",
            "postgresql://u@localhost:99999/trackspense_e2e_x",
            "postgres://u@localhost:5432/trackspense_e2e_x",
            "POSTGRESQL://u@localhost:5432/trackspense_e2e_x",
            "postgresql://u@LOCALHOST:5432/trackspense_e2e_x",
        ):
            with self.subTest(url=url):
                with self.assertRaises(g.GuardError):
                    g.validate_database_url(url)


class BackendEnv(unittest.TestCase):
    def setUp(self):
        self.env = g.build_backend_env(OK, jwt_secret="s" * 32, base_path="/usr/bin:/bin", home="/tmp/h")

    def test_ignores_the_callers_environment_entirely(self):
        os.environ["GEMINI_API_KEY"] = "real-key"
        os.environ["MAIL_PASSWORD"] = "real-pw"
        os.environ["DATABASE_URL"] = "postgresql://prod.example.com/prod"
        try:
            env = g.build_backend_env(OK, jwt_secret="s" * 32, base_path="/usr/bin:/bin", home="/tmp/h")
        finally:
            for k in ("GEMINI_API_KEY", "MAIL_PASSWORD", "DATABASE_URL"):
                os.environ.pop(k, None)
        self.assertEqual(env["GEMINI_API_KEY"], "")
        self.assertEqual(env["MAIL_PASSWORD"], "")
        self.assertEqual(env["DATABASE_URL"], OK)

    def test_every_outbound_integration_is_disabled(self):
        for key in ("GEMINI_API_KEY", "OPENAI_API_KEY", "GOOGLE_CLIENT_ID", "MAIL_USERNAME", "MAIL_PASSWORD",
                    "EXPO_ACCESS_TOKEN", "OLLAMA_BASE_URL", "OLLAMA_HOST", "RATE_LIMIT_STORAGE_URI"):
            self.assertEqual(self.env[key], "", key)
        self.assertEqual(self.env["AI_ENABLED"], "false")
        self.assertEqual(self.env["CATEGORIZE_LLM_FALLBACK"], "false")
        self.assertEqual(self.env["OCR_ENGINE"], "mock")
        self.assertEqual(self.env["MCP_ENABLED"], "false")

    def test_keyless_outbound_endpoints_are_blackholed(self):
        # Push and FX lookups need no key, so blanking credentials is not enough: point them at a closed local port.
        for key in ("EXPO_PUSH_URL", "FX_RATE_API_URL"):
            self.assertTrue(self.env[key].startswith("http://127.0.0.1:9"), key)

    def test_is_a_local_backend(self):
        self.assertEqual(self.env["ENVIRONMENT"], "local")
        self.assertEqual(self.env["AUTH_COOKIE_SECURE"], "false")
        self.assertNotEqual(self.env["JWT_SECRET"], "change-me")

    def test_only_allowlisted_process_variables_are_present(self):
        self.assertTrue({"PATH", "HOME"} <= set(self.env))
        self.assertNotIn("AWS_ACCESS_KEY_ID", self.env)
        self.assertNotIn("GOOGLE_APPLICATION_CREDENTIALS", self.env)

    def test_refuses_a_non_disposable_database(self):
        with self.assertRaises(g.GuardError):
            g.build_backend_env("postgresql://u@localhost/trackspense_dev", jwt_secret="s" * 32,
                                base_path="/usr/bin", home="/tmp/h")

    def test_refuses_a_weak_jwt_secret(self):
        for secret in ("", "change-me", "short"):
            with self.subTest(secret=secret):
                with self.assertRaises(g.GuardError):
                    g.build_backend_env(OK, jwt_secret=secret, base_path="/usr/bin", home="/tmp/h")


class ValidateAppApiUrl(unittest.TestCase):
    def test_accepts_only_a_local_test_backend_origin(self):
        for url in ("http://localhost:18080", "http://127.0.0.1:18080", "http://10.0.2.2:18080"):
            self.assertEqual(g.validate_app_api_url(url), url)
        for url in ("", None, "https://api.example.test", "https://localhost:18080", "http://localhost",
                    "http://localhost:18080/", "http://localhost.evil.test:18080", "http://user@localhost:18080",
                    "https://varavu-selavu-backend-952416556244.us-central1.run.app",
                    "http://localhost:18080\n", "http://localhost:\u0661\u0668\u0660\u0668\u0660", "http://localhost:18080 "):
            with self.subTest(url=url):
                with self.assertRaises(g.GuardError):
                    g.validate_app_api_url(url)

    def test_rule_is_identical_to_the_app_and_the_config_plugin(self):
        pattern = re.compile(r"const LOCAL_TEST_BACKEND = (/.+/);")
        root = GUARD.parents[3] / "varavu_selavu_mobile"
        app = pattern.search((root / "src/core/api/baseUrl.ts").read_text()).group(1)
        plugin = pattern.search((root / "withE2eVariant.js").read_text()).group(1)
        self.assertEqual(app, plugin)
        self.assertEqual(g.APP_URL_RULE_SOURCE, app)


class ValidateFromEnvironment(unittest.TestCase):
    """The database URL carries the cluster password, so the shell script validates it from the environment."""

    def run_cli(self, url):
        with unittest.mock.patch.dict(os.environ, {"E2E_DATABASE_URL": url}):
            return g._main(["validate-db-env"])

    def test_accepts_a_valid_url_and_refuses_bad_or_missing_ones(self):
        self.assertEqual(self.run_cli(OK), 0)
        for url in ("", "postgresql://u@db.example.com/trackspense_e2e_x", "postgresql://localhost/trackspense_e2e_x?dbname=prod"):
            with self.subTest(url=url):
                self.assertEqual(self.run_cli(url), 1)


class ApiUrlFor(unittest.TestCase):
    def test_platform_hosts(self):
        self.assertEqual(g.api_url_for("ios", 8123), "http://localhost:8123")
        self.assertEqual(g.api_url_for("android", 8123), "http://10.0.2.2:8123")

    def test_rejects_unknown_platform_and_bad_port(self):
        with self.assertRaises(g.GuardError):
            g.api_url_for("web", 8123)
        with self.assertRaises(g.GuardError):
            g.api_url_for("ios", 80)


if __name__ == "__main__":
    unittest.main()
