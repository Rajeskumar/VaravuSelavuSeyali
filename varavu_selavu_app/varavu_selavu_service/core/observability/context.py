"""Request and background-task correlation context (ContextVar-isolated)."""

from __future__ import annotations

import contextvars
import re
import uuid
from dataclasses import dataclass
from typing import Optional, Tuple

_TRACE_ID_RE = re.compile(r"^[0-9a-fA-F]{32}$")
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


@dataclass
class DbRequestMetrics:
    """Monotonic per-request DB timing accumulators (never stores SQL or params)."""

    acquire_ms: float = 0.0
    query_ms: float = 0.0
    commit_ms: float = 0.0
    query_count: int = 0
    acquire_timeouts: int = 0


_request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "ts_request_id", default=None
)
_trace_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "ts_trace_id", default=None
)
_db_metrics_var: contextvars.ContextVar[Optional[DbRequestMetrics]] = contextvars.ContextVar(
    "ts_db_metrics", default=None
)


def new_request_id() -> str:
    """Generate a fresh server-owned UUID4 request ID (never trust client headers)."""
    return str(uuid.uuid4())


def validate_request_id(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str) and _UUID_RE.match(value):
        return value.lower()
    return None


def validate_cloud_trace_id(header_value: Optional[str]) -> Optional[str]:
    """Validate X-Cloud-Trace-Context header (`<32-hex-trace-id>/<span-id>;o=1`)."""
    if not header_value or not isinstance(header_value, str):
        return None
    trace_part = header_value.split("/", 1)[0].strip()
    if _TRACE_ID_RE.match(trace_part):
        return trace_part.lower()
    return None


def get_request_id() -> Optional[str]:
    return _request_id_var.get()


def get_trace_id() -> Optional[str]:
    return _trace_id_var.get()


def get_db_metrics() -> Optional[DbRequestMetrics]:
    return _db_metrics_var.get()


def bind_request_context(
    *,
    request_id: Optional[str],
    trace_id: Optional[str] = None,
    with_db_metrics: bool = True,
) -> Tuple[
    contextvars.Token[Optional[str]],
    contextvars.Token[Optional[str]],
    contextvars.Token[Optional[DbRequestMetrics]],
]:
    req_tok = _request_id_var.set(validate_request_id(request_id))
    trace_tok = _trace_id_var.set(
        trace_id.lower() if isinstance(trace_id, str) and _TRACE_ID_RE.match(trace_id) else None
    )
    db_tok = _db_metrics_var.set(DbRequestMetrics() if with_db_metrics else None)
    return req_tok, trace_tok, db_tok


def reset_request_context(
    tokens: Tuple[
        contextvars.Token[Optional[str]],
        contextvars.Token[Optional[str]],
        contextvars.Token[Optional[DbRequestMetrics]],
    ]
) -> None:
    req_tok, trace_tok, db_tok = tokens
    _request_id_var.reset(req_tok)
    _trace_id_var.reset(trace_tok)
    _db_metrics_var.reset(db_tok)


def capture_task_context() -> Tuple[Optional[str], Optional[str]]:
    """Capture originating request/trace IDs before scheduling a BackgroundTask."""
    return get_request_id(), get_trace_id()
