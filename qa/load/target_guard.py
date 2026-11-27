#!/usr/bin/env python3
"""Fail-closed target isolation guard for TrackSpense load testing (TS-OBS-001 AC-10).

Refuses to run against:
- Production or production-looking hosts/domains (cerebroos.com, trackspense.app, prod Cloud Run).
- Unknown hosts not explicitly listed in `LOAD_TEST_TARGET_ALLOWLIST`.
- Non-local hosts without explicit `LOAD_TEST_NON_LOCAL_AUTHORIZED=true`.
- Missing synthetic run marker (`LOAD_TEST_RUN_MARKER`).
- Production/unknown database URLs or SQLite (never used for capacity qualification).
- Any target that HTTP-redirects to a forbidden/unlisted host.

Never implicitly reads `.env`.
"""

from __future__ import annotations

import hashlib
import os
import sys
from dataclasses import dataclass
from typing import Iterable, Mapping, Optional
from urllib.parse import urlparse

FORBIDDEN_HOST_SUBSTRINGS = (
    "cerebroos.com",
    "trackspense.app",
    "varavu-selavu-backend-952416556244",
    "varavu-selavu-frontend-952416556244",
    "supabase.co",
    "prod",
)

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


class TargetGuardError(ValueError):
    """Raised when a load-test target fails isolation preflight."""


@dataclass(frozen=True)
class ValidatedTarget:
    base_url: str
    host: str
    is_local: bool
    run_marker: str
    db_fingerprint: Optional[str]


def _host_is_forbidden(host: str) -> bool:
    lower = host.lower().strip()
    if not lower:
        return True
    for bad in FORBIDDEN_HOST_SUBSTRINGS:
        if bad in lower:
            return True
    return False


def fingerprint_db_url(db_url: str) -> str:
    """Return a non-reversible, credential-free fingerprint (scheme + host + db hash)."""
    parsed = urlparse(db_url)
    safe_part = f"{parsed.scheme}://{parsed.hostname or ''}:{parsed.port or ''}{parsed.path or ''}"
    digest = hashlib.sha256(safe_part.encode("utf-8")).hexdigest()[:12]
    return f"{parsed.scheme}://{parsed.hostname or 'unknown'}/{digest}"


def validate_load_target(
    *,
    base_url: str,
    env: Optional[Mapping[str, str]] = None,
    db_url: Optional[str] = None,
    require_postgres: bool = False,
    redirect_locations: Iterable[str] = (),
) -> ValidatedTarget:
    """Validate API URL, DB URL, allowlist, marker, and redirects; fail closed on any issue."""
    env_map = env if env is not None else os.environ

    if not base_url or not isinstance(base_url, str):
        raise TargetGuardError("LOAD_TEST_BASE_URL is required")

    parsed = urlparse(base_url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise TargetGuardError("LOAD_TEST_BASE_URL must be a valid http(s) origin")

    host = parsed.hostname.lower()
    if _host_is_forbidden(host):
        raise TargetGuardError("Refused: target host matches forbidden production pattern")

    is_local = host in LOCAL_HOSTS

    # Require explicit allowlist even for staging/local targets.
    allowlist_raw = (env_map.get("LOAD_TEST_TARGET_ALLOWLIST") or "").strip()
    allowlist = {h.strip().lower() for h in allowlist_raw.split(",") if h.strip()}
    if host not in allowlist:
        raise TargetGuardError("Refused: target host is not in LOAD_TEST_TARGET_ALLOWLIST")

    run_marker = (env_map.get("LOAD_TEST_RUN_MARKER") or "").strip()
    if not run_marker or not run_marker.startswith("ts-load-"):
        raise TargetGuardError("Refused: LOAD_TEST_RUN_MARKER must be set and start with 'ts-load-'")

    if not is_local:
        if (env_map.get("LOAD_TEST_NON_LOCAL_AUTHORIZED") or "").strip().lower() != "true":
            raise TargetGuardError(
                "Refused: non-local load target requires explicit LOAD_TEST_NON_LOCAL_AUTHORIZED=true"
            )
        if parsed.scheme != "https":
            raise TargetGuardError("Refused: non-local load target must use https")

    for loc in redirect_locations:
        rp = urlparse(loc)
        rhost = (rp.hostname or "").lower()
        if rhost and (_host_is_forbidden(rhost) or rhost not in allowlist):
            raise TargetGuardError("Refused: target redirects to a forbidden or non-allowlisted host")

    db_fp: Optional[str] = None
    if db_url is not None or require_postgres:
        effective_db = (db_url or "").strip()
        if not effective_db:
            raise TargetGuardError("Refused: LOAD_TEST_DATABASE_URL is required")
        dp = urlparse(effective_db)
        if require_postgres and not dp.scheme.startswith("postgres"):
            raise TargetGuardError("Refused: capacity qualification requires isolated PostgreSQL, not SQLite")
        db_host = (dp.hostname or "").lower()
        if _host_is_forbidden(db_host):
            raise TargetGuardError("Refused: database host matches forbidden production pattern")
        if not is_local and db_host not in LOCAL_HOSTS:
            db_allow_raw = (env_map.get("LOAD_TEST_DB_HOST_ALLOWLIST") or "").strip()
            db_allow = {h.strip().lower() for h in db_allow_raw.split(",") if h.strip()}
            if db_host not in db_allow:
                raise TargetGuardError("Refused: database host is not in LOAD_TEST_DB_HOST_ALLOWLIST")
        db_fp = fingerprint_db_url(effective_db)

    return ValidatedTarget(
        base_url=base_url.rstrip("/"),
        host=host,
        is_local=is_local,
        run_marker=run_marker,
        db_fingerprint=db_fp,
    )


def main() -> int:
    try:
        validated = validate_load_target(
            base_url=os.environ.get("LOAD_TEST_BASE_URL", ""),
            db_url=os.environ.get("LOAD_TEST_DATABASE_URL") or None,
            require_postgres=bool(os.environ.get("LOAD_TEST_REQUIRE_POSTGRES")),
        )
    except TargetGuardError as exc:
        print(f"TARGET GUARD BLOCKED: {exc}", file=sys.stderr)
        return 2
    print(
        f"TARGET GUARD OK: host={validated.host} local={validated.is_local} "
        f"marker={validated.run_marker} db={validated.db_fingerprint or 'none'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
