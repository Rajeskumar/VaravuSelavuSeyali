"""Bounded, isolated database readiness probe for /api/v1/readyz (TS-OBS-001 AC-06).

Uses a dedicated small connection budget (pool_size=1, max_overflow=0) with driver-level
connect and statement timeouts and a hard <=1.0 s total wall deadline, returning generic
health status without leaking DB credentials, hostnames, or raw exception messages.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional, Tuple

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from varavu_selavu_service.core.observability.sanitizer import log_event, safe_error_type

_logger = logging.getLogger("varavu_selavu_service.readiness")
_probe_lock = threading.Lock()
_probe_engine: Optional[Engine] = None
_probe_url: Optional[str] = None


def _build_probe_engine(db_url: str) -> Engine:
    normalized = db_url
    if normalized.startswith("postgres://"):
        normalized = normalized.replace("postgres://", "postgresql://", 1)

    if normalized.startswith("postgresql"):
        return create_engine(
            normalized,
            pool_size=1,
            max_overflow=0,
            pool_timeout=0.5,
            pool_pre_ping=True,
            connect_args={
                "connect_timeout": 1,
                "options": "-c statement_timeout=500",
            },
        )
    # SQLite fallback for local unit tests
    return create_engine(
        normalized,
        connect_args={"timeout": 0.5, "check_same_thread": False},
    )


def _get_probe_engine(db_url: str) -> Engine:
    global _probe_engine, _probe_url
    with _probe_lock:
        if _probe_engine is None or _probe_url != db_url:
            if _probe_engine is not None:
                try:
                    _probe_engine.dispose()
                except Exception:
                    pass
            _probe_engine = _build_probe_engine(db_url)
            _probe_url = db_url
        return _probe_engine


def reset_probe_engine() -> None:
    """Dispose the cached probe engine (useful in tests)."""
    global _probe_engine, _probe_url
    with _probe_lock:
        if _probe_engine is not None:
            try:
                _probe_engine.dispose()
            except Exception:
                pass
        _probe_engine = None
        _probe_url = None


def check_database_readiness(
    *,
    db_url: str,
    engine_override: Optional[Engine] = None,
    timeout_sec: float = 0.9,
) -> Tuple[bool, float]:
    """Run a read-only `SELECT 1` probe bounded to `timeout_sec` (<= 1.0 s).

    Returns `(is_ready, duration_ms)`. Never raises.
    """
    t0 = time.monotonic()
    result: dict[str, object] = {"ok": False, "error": None}
    engine = engine_override or _get_probe_engine(db_url)

    def _run_probe() -> None:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            result["ok"] = True
        except Exception as exc:
            result["error"] = exc
            # Recycle failed connections on the dedicated probe engine.
            if engine_override is None:
                try:
                    engine.dispose()
                except Exception:
                    pass

    worker = threading.Thread(target=_run_probe, name="readyz-db-probe", daemon=True)
    worker.start()
    worker.join(timeout=timeout_sec)
    elapsed_ms = (time.monotonic() - t0) * 1000.0

    if worker.is_alive():
        if engine_override is None:
            try:
                engine.dispose()
            except Exception:
                pass
        log_event(
            _logger,
            logging.WARNING,
            "component_completed",
            component="readiness",
            outcome="timeout",
            duration_ms=round(elapsed_ms, 2),
            error_type="TimeoutError",
        )
        return False, round(elapsed_ms, 2)

    if result["ok"]:
        return True, round(elapsed_ms, 2)

    exc = result["error"]
    log_event(
        _logger,
        logging.WARNING,
        "component_completed",
        component="readiness",
        outcome="unhealthy",
        duration_ms=round(elapsed_ms, 2),
        error_type=safe_error_type(exc if isinstance(exc, BaseException) else None),
    )
    return False, round(elapsed_ms, 2)
