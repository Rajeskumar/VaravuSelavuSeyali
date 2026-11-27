"""Tracked BackgroundTasks runner with context propagation and safe outcomes (AC-04, AC-06)."""

from __future__ import annotations

import logging
import time
from typing import Any, Callable, Optional

from fastapi import BackgroundTasks

from varavu_selavu_service.core.observability.context import (
    bind_request_context,
    capture_task_context,
    reset_request_context,
)
from varavu_selavu_service.core.observability.sanitizer import log_event, safe_error_type

_logger = logging.getLogger("varavu_selavu_service.background")


def run_tracked_background_task(
    task_type: str,
    originating_request_id: Optional[str],
    originating_trace_id: Optional[str],
    fn: Callable[..., Any],
    *args: Any,
    **kwargs: Any,
) -> None:
    """Execute a background task with isolated originating request context and safe outcome logs.

    Post-response failures are logged separately from HTTP outcomes and do not propagate
    into the already-completed HTTP response.
    """
    tokens = bind_request_context(
        request_id=originating_request_id,
        trace_id=originating_trace_id,
        with_db_metrics=True,
    )
    t0 = time.monotonic()
    log_event(
        _logger,
        logging.INFO,
        "background_task",
        task_type=task_type,
        outcome="started",
    )
    try:
        fn(*args, **kwargs)
    except Exception as exc:
        elapsed_ms = (time.monotonic() - t0) * 1000.0
        log_event(
            _logger,
            logging.ERROR,
            "background_task",
            exc_info=exc,
            task_type=task_type,
            outcome="failed",
            duration_ms=round(elapsed_ms, 2),
            error_type=safe_error_type(exc),
        )
    else:
        elapsed_ms = (time.monotonic() - t0) * 1000.0
        log_event(
            _logger,
            logging.INFO,
            "background_task",
            task_type=task_type,
            outcome="completed",
            duration_ms=round(elapsed_ms, 2),
        )
    finally:
        reset_request_context(tokens)


def schedule_background_task(
    background_tasks: BackgroundTasks,
    task_type: str,
    fn: Callable[..., Any],
    *args: Any,
    **kwargs: Any,
) -> None:
    """Schedule `fn` on FastAPI `BackgroundTasks` with originating request ID captured."""
    req_id, trace_id = capture_task_context()
    background_tasks.add_task(
        run_tracked_background_task,
        task_type,
        req_id,
        trace_id,
        fn,
        *args,
        **kwargs,
    )
