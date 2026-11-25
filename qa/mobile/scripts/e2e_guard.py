#!/usr/bin/env python3
"""Safety contract for the native-E2E test backend (TS-QA-103).

The backend under test reads its settings from the process environment, from `./.env` (pydantic) and from
the first `.env` found above `core/config.py` (`load_dotenv()`), and a developer's `.env` may point at
production. So instead of trusting that nothing sensitive is set, this module:

  * validates that the database is a local, disposable `trackspense_e2e_*` database, and
  * builds the COMPLETE environment for the backend process from an allowlist; nothing is inherited.

`run_test_backend.py` additionally disables `load_dotenv` and starts in an empty directory, so no `.env`
file can contribute either. Stdlib only; used by start-test-backend.sh and unit-tested from
scripts/quality/tests/test_mobile_e2e_guard.py.
"""
from __future__ import annotations

import os
import re
import sys

# One strict, anchored pattern for the whole URL. Anything libpq or SQLAlchemy could use to redirect the
# connection (query parameters such as host/hostaddr/dbname/service/options, a multi-host netloc, a unix-socket
# form, a fragment, whitespace or control characters, unicode digits) simply does not match.
_DATABASE_URL = re.compile(
    r"postgresql(?:\+psycopg2)?://"
    r"(?:[A-Za-z0-9_.~-]+(?::[A-Za-z0-9_.~%-]*)?@)?"
    r"(?:localhost|127\.0\.0\.1|\[::1\])"
    r"(?::(?P<port>[0-9]{1,5}))?"
    r"/trackspense_e2e_[a-z0-9_]+"
)
PLATFORM_HOST = {"ios": "localhost", "android": "10.0.2.2"}
# Must stay textually identical to LOCAL_TEST_BACKEND in varavu_selavu_mobile/src/core/api/baseUrl.ts and
# withE2eVariant.js (a unit test compares all three).
APP_URL_RULE_SOURCE = r"/^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2):\d{2,5}$/"
# Compiled FROM the single source above, with fullmatch and ASCII digits: Python's `$` also matches before a
# trailing newline and `\d` accepts unicode digits, which the JavaScript rule does not.
_APP_URL = re.compile(APP_URL_RULE_SOURCE[2:-2].replace("\\/", "/").replace("\\d", "[0-9]"))


class GuardError(Exception):
    """A safety rule was violated; the caller must stop, not retry."""


def validate_database_url(url: str) -> str:
    match = _DATABASE_URL.fullmatch(url) if isinstance(url, str) else None
    if match is None:
        raise GuardError("DATABASE_URL must be postgresql://[user[:password]@]localhost|127.0.0.1|[::1][:port]/"
                         "trackspense_e2e_<name> with no query string (a local, disposable database)")
    port = match.group("port")
    if port is not None and not 1 <= int(port) <= 65535:
        raise GuardError("database port out of range")
    return url


def validate_app_api_url(url: str | None) -> str:
    if not isinstance(url, str) or not _APP_URL.fullmatch(url):
        raise GuardError("the app's API URL must be http://localhost|127.0.0.1|10.0.2.2:<port> (origin only)")
    return url


def api_url_for(platform: str, port: int) -> str:
    if platform not in PLATFORM_HOST:
        raise GuardError(f"unknown platform {platform!r}")
    if not 1024 <= int(port) <= 65535:
        raise GuardError(f"port {port} is outside 1024-65535")
    return f"http://{PLATFORM_HOST[platform]}:{int(port)}"


def build_backend_env(database_url: str, *, jwt_secret: str, base_path: str, home: str) -> dict[str, str]:
    validate_database_url(database_url)
    if len(jwt_secret) < 16 or jwt_secret == "change-me":
        raise GuardError("JWT secret must be a random value of at least 16 characters")
    return {
        # The only process variables inherited, by explicit choice.
        "PATH": base_path,
        "HOME": home,
        "LANG": "en_US.UTF-8",
        # Backend settings, all explicit.
        "ENVIRONMENT": "local",
        "DEBUG": "false",
        "DATABASE_URL": database_url,
        "JWT_SECRET": jwt_secret,
        "AUTH_COOKIE_SECURE": "false",
        "GROUPS_ENABLED": "true",
        "BUDGETS_ENABLED": "true",
        "CARD_COACH_ENABLED": "true",
        "TAGS_ENABLED": "true",
        "ENTITY_RESOLUTION_ENABLED": "false",
        "MCP_ENABLED": "false",
        "MCP_WRITES_ENABLED": "false",
        # No AI, no OCR provider, no mail, no push, no external identity or rate-limit store.
        "AI_ENABLED": "false",
        "CATEGORIZE_LLM_FALLBACK": "false",
        "OCR_ENGINE": "mock",
        "GEMINI_API_KEY": "",
        "OPENAI_API_KEY": "",
        "OLLAMA_BASE_URL": "",
        "OLLAMA_HOST": "",
        "GOOGLE_CLIENT_ID": "",
        "MAIL_USERNAME": "",
        "MAIL_PASSWORD": "",
        "EXPO_ACCESS_TOKEN": "",
        "RATE_LIMIT_STORAGE_URI": "",
        # Keyless outbound endpoints: blanking credentials is not enough, so point them at a closed local port.
        "EXPO_PUSH_URL": "http://127.0.0.1:9/push-disabled",
        "FX_RATE_API_URL": "http://127.0.0.1:9/fx-disabled",
    }


def _main(argv: list[str]) -> int:
    """CLI used by shell scripts: `validate-db-env` | `validate-db <url>` (no secrets on argv) | `validate-app-url <url>` | `api-url <platform> <port>`."""
    try:
        if argv[:1] == ["validate-db-env"] and len(argv) == 1:
            # The URL carries the throwaway cluster's password: read it from the environment, never from argv.
            validate_database_url(os.environ.get("E2E_DATABASE_URL", ""))
        elif argv[:1] == ["validate-db"] and len(argv) == 2:
            print(validate_database_url(argv[1]))
        elif argv[:1] == ["validate-app-url"] and len(argv) == 2:
            print(validate_app_api_url(argv[1]))
        elif argv[:1] == ["api-url"] and len(argv) == 3:
            print(api_url_for(argv[1], int(argv[2])))
        else:
            print(__doc__, file=sys.stderr)
            return 2
    except GuardError as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
