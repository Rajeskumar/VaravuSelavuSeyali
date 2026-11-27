"""SQLAlchemy connection acquisition, execution, and commit timing hooks (TS-OBS-001 AC-05).

Measures actual DB connection checkout (including connect + pre-ping), query execution,
and commit durations using monotonic clocks. Never captures or logs SQL statements or
bind parameters. Can be toggled off via `OBSERVABILITY_DB_TIMING_ENABLED=false` for
overhead measurement or rollback without disabling privacy sanitization.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import TimeoutError as SATimeoutError

from varavu_selavu_service.core.observability.context import get_db_metrics
from varavu_selavu_service.core.observability.sanitizer import log_event, safe_error_type

_logger = logging.getLogger("varavu_selavu_service.db")
_thread_local = threading.local()


def _db_timing_enabled() -> bool:
    return os.environ.get("OBSERVABILITY_DB_TIMING_ENABLED", "true").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def instrument_engine(engine: Engine, session_factory: Any = None) -> None:
    """Attach idempotent timing listeners to a SQLAlchemy engine and optional sessionmaker."""
    if getattr(engine, "_ts_obs_instrumented", False):
        return
    engine._ts_obs_instrumented = True  # type: ignore[attr-defined]

    # Track actual checkout acquisition duration (pool wait + connect + pre-ping).
    original_connect = engine.pool.connect

    def _timed_pool_connect(*args: Any, **kwargs: Any) -> Any:
        if not _db_timing_enabled():
            return original_connect(*args, **kwargs)
        t0 = time.monotonic()
        try:
            conn = original_connect(*args, **kwargs)
            elapsed_ms = (time.monotonic() - t0) * 1000.0
            metrics = get_db_metrics()
            if metrics is not None:
                metrics.acquire_ms += elapsed_ms
            if elapsed_ms >= 250.0:
                log_event(
                    _logger,
                    logging.WARNING,
                    "component_completed",
                    component="db_acquire",
                    outcome="success",
                    duration_ms=round(elapsed_ms, 2),
                )
            return conn
        except SATimeoutError as exc:
            elapsed_ms = (time.monotonic() - t0) * 1000.0
            metrics = get_db_metrics()
            if metrics is not None:
                metrics.acquire_ms += elapsed_ms
                metrics.acquire_timeouts += 1
            log_event(
                _logger,
                logging.ERROR,
                "component_completed",
                component="db_acquire",
                outcome="timeout",
                duration_ms=round(elapsed_ms, 2),
                error_type=safe_error_type(exc),
            )
            raise
        except Exception as exc:
            elapsed_ms = (time.monotonic() - t0) * 1000.0
            metrics = get_db_metrics()
            if metrics is not None:
                metrics.acquire_ms += elapsed_ms
            log_event(
                _logger,
                logging.ERROR,
                "component_completed",
                component="db_acquire",
                outcome="failed",
                duration_ms=round(elapsed_ms, 2),
                error_type=safe_error_type(exc),
            )
            raise

    engine.pool.connect = _timed_pool_connect  # type: ignore[method-assign]

    @event.listens_for(engine, "before_cursor_execute")
    def _before_cursor_execute(
        conn: Any, cursor: Any, statement: Any, parameters: Any, context: Any, executemany: Any
    ) -> None:
        if not _db_timing_enabled():
            return
        # Explicitly ignore `statement` and `parameters` — never capture SQL text or values.
        conn.info.setdefault("_ts_query_starts", []).append(time.monotonic())

    @event.listens_for(engine, "after_cursor_execute")
    def _after_cursor_execute(
        conn: Any, cursor: Any, statement: Any, parameters: Any, context: Any, executemany: Any
    ) -> None:
        starts = conn.info.get("_ts_query_starts")
        if not starts:
            return
        t0 = starts.pop()
        elapsed_ms = (time.monotonic() - t0) * 1000.0
        metrics = get_db_metrics()
        if metrics is not None:
            metrics.query_ms += elapsed_ms
            metrics.query_count += 1
        if elapsed_ms >= 500.0:
            log_event(
                _logger,
                logging.WARNING,
                "component_completed",
                component="db_query",
                outcome="success",
                duration_ms=round(elapsed_ms, 2),
            )

    @event.listens_for(engine, "handle_error")
    def _handle_error(exception_context: Any) -> None:
        conn = getattr(exception_context, "connection", None)
        starts = conn.info.get("_ts_query_starts") if conn is not None else None
        elapsed_ms = 0.0
        if starts:
            t0 = starts.pop()
            elapsed_ms = (time.monotonic() - t0) * 1000.0
        metrics = get_db_metrics()
        if metrics is not None:
            metrics.query_ms += elapsed_ms
            metrics.query_count += 1
        orig_exc = getattr(exception_context, "original_exception", None)
        log_event(
            _logger,
            logging.WARNING,
            "component_completed",
            component="db_query",
            outcome="failed",
            duration_ms=round(elapsed_ms, 2),
            error_type=safe_error_type(orig_exc),
        )

    if session_factory is not None:
        @event.listens_for(session_factory, "before_commit")
        def _before_commit(session: Any) -> None:
            if not _db_timing_enabled():
                return
            _thread_local.commit_start = time.monotonic()

        @event.listens_for(session_factory, "after_commit")
        def _after_commit(session: Any) -> None:
            t0 = getattr(_thread_local, "commit_start", None)
            if t0 is None:
                return
            _thread_local.commit_start = None
            elapsed_ms = (time.monotonic() - t0) * 1000.0
            metrics = get_db_metrics()
            if metrics is not None:
                metrics.commit_ms += elapsed_ms
