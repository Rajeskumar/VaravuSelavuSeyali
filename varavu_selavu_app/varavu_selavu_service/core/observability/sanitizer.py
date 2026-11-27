"""Unconditional privacy-safe JSON logging boundary (TS-OBS-001 AC-01, AC-02).

Every log record — whether emitted via `log_event(...)` or by a third-party/SDK/Uvicorn
handler — passes through `SafeJsonFormatter`. Unknown fields, arbitrary messages, objects,
locals, SQL statements, exception messages, URLs and credentials are never serialized.
Sanitizer failure emits a fixed static JSON fallback and never raises into business logic.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import sys
import traceback
from datetime import datetime, timezone
from types import TracebackType
from typing import Any, Dict, List, Optional, Tuple, Union

from varavu_selavu_service.core.observability.context import (
    get_request_id,
    get_trace_id,
    validate_request_id,
)

SERVICE_NAME = "trackspense-backend"
MAX_FRAMES = 40
FALLBACK_LOG_LINE = (
    '{"severity":"ERROR","event":"log_sanitizer_fallback",'
    '"service":"trackspense-backend","error_category":"sanitizer_error"}'
)

_TOKEN_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,63}$")
_EVENT_RE = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")
_REVISION_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$")
_ERROR_TYPE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]{0,63}$")
_ROUTE_RE = re.compile(r"^(?:/[a-zA-Z0-9_{}.-]*)+$|^unmatched$")

_ALLOWED_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "OTHER"})
_ALLOWED_OUTCOMES = frozenset(
    {
        "success",
        "client_error",
        "auth_rejected",
        "not_found",
        "quota_rejected",
        "rate_limited",
        "server_error",
        "cancelled",
        "timeout",
        "failed",
        "started",
        "completed",
        "skipped",
        "confirmed",
        "rejected",
        "unknown",
        "measured",
        "network_error",
        "fallback",
        "degraded",
        "healthy",
        "unhealthy",
    }
)
_ALLOWED_OP_CLASSES = frozenset(
    {"core_read", "core_write", "ai", "receipt", "auth", "other", "probe", "telemetry"}
)
_ALLOWED_COMPONENTS = frozenset(
    {
        "db_acquire",
        "db_query",
        "db_commit",
        "ocr",
        "llm",
        "categorize_fallback",
        "insight_aggregation",
        "email",
        "push",
        "fx_rate",
        "entity_resolution",
        "category_memory",
        "startup",
        "readiness",
        "mcp",
        "auth",
        "activity",
        "other",
    }
)
_ALLOWED_TASK_TYPES = frozenset(
    {"insights_aggregation", "notification_fan_out", "ocr_warmup", "other"}
)
_ALLOWED_PROVIDERS = frozenset(
    {"gemini", "openai", "ollama", "rapidocr", "expo_push", "smtp", "fx_rate", "local", "other"}
)
_ALLOWED_FEATURES = frozenset({"chat", "receipt", "categorize", "budget_why", "other"})
_ALLOWED_PLATFORMS = frozenset({"web", "ios", "android"})
_ALLOWED_UNITS = frozenset({"ms", "score"})
_ALLOWED_ENTITY_TYPES = frozenset({"item", "merchant", "other"})

_ALLOWED_LOGGER_PREFIXES = (
    "varavu_selavu_service",
    "varavu_selavu",
    "uvicorn",
    "fastapi",
    "starlette",
    "sqlalchemy",
    "psycopg2",
    "httpx",
    "httpcore",
    "urllib3",
    "requests",
    "langchain",
    "langgraph",
    "google",
    "openai",
    "authlib",
    "mcp",
    "smtplib",
    "rapidocr",
    "alembic",
    "root",
)

_INT_FIELDS = frozenset(
    {
        "status",
        "http_status",
        "status_code",
        "count",
        "input_tokens",
        "output_tokens",
        "query_count",
        "batch_size",
        "acquire_timeouts",
        "linked",
        "skipped",
        "errors",
        "total",
        "processed",
    }
)
_FLOAT_FIELDS = frozenset(
    {
        "duration_ms",
        "db_acquire_ms",
        "db_query_ms",
        "db_commit_ms",
        "est_cost_usd",
        "est_total_usd",
        "budget_usd",
        "value",
    }
)
_BOOL_FIELDS = frozenset({"writes_enabled", "mcp_enabled", "llm_used", "matched", "reconciled"})

_NOISY_SDK_LOGGERS = (
    "sqlalchemy.engine",
    "sqlalchemy.pool",
    "sqlalchemy.dialects",
    "psycopg2",
    "httpx",
    "httpcore",
    "urllib3",
    "requests",
    "authlib",
    "mcp",
    "langchain",
    "langgraph",
    "openai",
    "google",
    "smtplib",
    "multipart",
)

_cached_env: str = "local"
_cached_revision: Optional[str] = None


def _sanitize_env(raw: Optional[str]) -> str:
    if isinstance(raw, str):
        cleaned = raw.strip().lower()
        if cleaned in {"local", "development", "dev", "staging", "qa", "production", "prod", "test"}:
            return cleaned
    return "unknown"


def _sanitize_revision(raw: Optional[str]) -> Optional[str]:
    if isinstance(raw, str):
        cleaned = raw.strip()
        if _REVISION_RE.match(cleaned):
            return cleaned
    return None


def _sanitize_logger_category(name: Optional[str]) -> str:
    if not isinstance(name, str) or not name:
        return "root"
    for prefix in _ALLOWED_LOGGER_PREFIXES:
        if name == prefix or name.startswith(prefix + "."):
            parts = name.split(".")[:3]
            candidate = ".".join(parts)
            if _TOKEN_RE.match(candidate):
                return candidate
    return "third_party"


def safe_error_type(exc: Optional[BaseException]) -> str:
    """Return bounded exception class name without ever touching str(exc) or args."""
    if exc is None:
        return "other"
    try:
        name = type(exc).__name__
    except Exception:
        return "other"
    if isinstance(name, str) and _ERROR_TYPE_RE.match(name):
        return name
    return "other"


def _normalize_frame_path(filename: str) -> str:
    if not isinstance(filename, str) or not filename:
        return "<unknown>"
    normalized = filename.replace("\\", "/")
    for marker in ("varavu_selavu_service/", "varavu_selavu_app/", "scripts/", "site-packages/"):
        idx = normalized.find(marker)
        if idx != -1:
            rel = normalized[idx:]
            return rel[:160]
    return os.path.basename(normalized)[:80] or "<unknown>"


def extract_safe_frames(
    tb: Optional[TracebackType],
    max_frames: int = MAX_FRAMES,
) -> List[Dict[str, Union[str, int]]]:
    """Extract at most `max_frames` repository-relative frames without source, paths, or locals."""
    if tb is None:
        return []
    frames: List[Dict[str, Union[str, int]]] = []
    try:
        summary = traceback.extract_tb(tb, limit=max_frames)
        for frame in summary[:max_frames]:
            func = frame.name if isinstance(frame.name, str) else "<unknown>"
            line = int(frame.lineno) if isinstance(frame.lineno, int) and frame.lineno >= 0 else 0
            frames.append(
                {
                    "module": _normalize_frame_path(frame.filename),
                    "function": func[:80],
                    "line": line,
                }
            )
    except Exception:
        return []
    return frames


def _sanitize_fields(raw_fields: Dict[str, Any]) -> Dict[str, Any]:
    """Strictly allowlist and validate every event field; silently drop everything else."""
    clean: Dict[str, Any] = {}
    for key, val in raw_fields.items():
        if val is None:
            continue
        if key == "route":
            if isinstance(val, str) and len(val) <= 128 and _ROUTE_RE.match(val):
                clean["route"] = val
            else:
                clean["route"] = "unmatched"
        elif key == "method":
            s = str(val).upper() if isinstance(val, str) else "OTHER"
            clean["method"] = s if s in _ALLOWED_METHODS else "OTHER"
        elif key == "outcome":
            if isinstance(val, str) and val in _ALLOWED_OUTCOMES:
                clean["outcome"] = val
        elif key == "operation_class":
            if isinstance(val, str) and val in _ALLOWED_OP_CLASSES:
                clean["operation_class"] = val
        elif key == "component":
            if isinstance(val, str) and val in _ALLOWED_COMPONENTS:
                clean["component"] = val
        elif key == "task_type":
            if isinstance(val, str) and val in _ALLOWED_TASK_TYPES:
                clean["task_type"] = val
        elif key == "provider":
            if isinstance(val, str) and val in _ALLOWED_PROVIDERS:
                clean["provider"] = val
        elif key == "feature":
            if isinstance(val, str) and val in _ALLOWED_FEATURES:
                clean["feature"] = val
        elif key == "platform":
            if isinstance(val, str) and val in _ALLOWED_PLATFORMS:
                clean["platform"] = val
        elif key == "unit":
            if isinstance(val, str) and val in _ALLOWED_UNITS:
                clean["unit"] = val
        elif key == "entity_type":
            if isinstance(val, str) and val in _ALLOWED_ENTITY_TYPES:
                clean["entity_type"] = val
        elif key in ("error_type", "error_category", "operation", "action", "engine", "model"):
            if isinstance(val, str) and _TOKEN_RE.match(val):
                clean[key] = val
        elif key == "build":
            rev = _sanitize_revision(val)
            if rev:
                clean["build"] = rev
        elif key == "request_id":
            rid = validate_request_id(val)
            if rid:
                clean["request_id"] = rid
        elif key in _INT_FIELDS:
            if isinstance(val, int) and not isinstance(val, bool):
                clean[key] = val
        elif key in _FLOAT_FIELDS:
            if isinstance(val, (int, float)) and not isinstance(val, bool) and math.isfinite(val):
                clean[key] = round(float(val), 4)
        elif key in _BOOL_FIELDS:
            if isinstance(val, bool):
                clean[key] = val
    return clean


class _SuppressRawUvicornAccessFilter(logging.Filter):
    """Drop raw uvicorn.access records (which contain raw paths, queries, and client IPs).

    Normalized HTTP completion events are emitted by `ObservabilityMiddleware` instead.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        return bool(getattr(record, "_safe_event", False))


class SafeJsonFormatter(logging.Formatter):
    """Final output privacy boundary for all Python log handlers.

    - Safe events emitted via `log_event(...)` are validated against the strict field allowlist.
    - Non-adapter logs (root, Uvicorn, third-party SDKs) NEVER serialize `record.getMessage()`,
      `record.args`, or arbitrary extras — only fixed event + allowlisted logger category +
      bounded safe exception frames.
    - Any exception inside the formatter emits `FALLBACK_LOG_LINE` instead of raising.
    """

    def __init__(self, *, environment: Optional[str] = None, revision: Optional[str] = None):
        super().__init__()
        self._environment = _sanitize_env(environment) if environment else None
        self._revision = _sanitize_revision(revision) if revision else None

    def format(self, record: logging.LogRecord) -> str:
        try:
            return self._format_safe(record)
        except Exception:
            return FALLBACK_LOG_LINE

    def _format_safe(self, record: logging.LogRecord) -> str:
        env = self._environment or _cached_env
        rev = self._revision or _cached_revision

        is_safe = bool(getattr(record, "_safe_event", False))
        raw_event = getattr(record, "_safe_event_name", None) if is_safe else None
        if isinstance(raw_event, str) and _EVENT_RE.match(raw_event):
            event_name = raw_event
        elif is_safe:
            event_name = "application_event"
        else:
            event_name = "third_party_log"

        payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "severity": record.levelname if record.levelname in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"} else "INFO",
            "event": event_name,
            "service": SERVICE_NAME,
            "environment": env,
            "logger": _sanitize_logger_category(record.name),
        }
        if rev:
            payload["revision"] = rev

        req_id = get_request_id()
        if req_id:
            payload["request_id"] = req_id
        trace_id = get_trace_id()
        if trace_id:
            payload["trace_id"] = trace_id

        if is_safe:
            raw_fields = getattr(record, "_safe_fields", None)
            if isinstance(raw_fields, dict):
                payload.update(_sanitize_fields(raw_fields))

        if record.exc_info and isinstance(record.exc_info, tuple) and len(record.exc_info) == 3:
            exc_type, exc_val, exc_tb = record.exc_info
            if exc_val is not None:
                payload.setdefault("error_type", safe_error_type(exc_val))
            elif exc_type is not None:
                type_name = getattr(exc_type, "__name__", "other")
                payload.setdefault(
                    "error_type",
                    type_name if isinstance(type_name, str) and _ERROR_TYPE_RE.match(type_name) else "other",
                )
            frames = extract_safe_frames(exc_tb)
            if frames:
                payload["frames"] = frames

        return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def log_event(
    logger_or_name: Union[logging.Logger, str],
    level: int,
    event: str,
    *,
    exc_info: Any = False,
    **fields: Any,
) -> None:
    """Emit a privacy-safe structured event through the configured logging boundary.

    Never raises into the caller even if logging or sanitization fails.
    """
    try:
        log = (
            logger_or_name
            if isinstance(logger_or_name, logging.Logger)
            else logging.getLogger(logger_or_name)
        )
        safe_event_name = event if isinstance(event, str) and _EVENT_RE.match(event) else "application_event"
        resolved_exc_info: Any = None
        if exc_info is True:
            resolved_exc_info = sys.exc_info()
        elif isinstance(exc_info, BaseException):
            resolved_exc_info = (type(exc_info), exc_info, exc_info.__traceback__)
        elif isinstance(exc_info, tuple) and len(exc_info) == 3:
            resolved_exc_info = exc_info

        record = log.makeRecord(
            name=log.name,
            level=level,
            fn="(observability)",
            lno=0,
            msg=safe_event_name,
            args=(),
            exc_info=resolved_exc_info,
        )
        record._safe_event = True  # type: ignore[attr-defined]
        record._safe_event_name = safe_event_name  # type: ignore[attr-defined]
        record._safe_fields = fields  # type: ignore[attr-defined]
        log.handle(record)
    except Exception:
        # Logging/sanitizer failure must never disrupt business operations.
        pass


def configure_logging(
    *,
    environment: Optional[str] = None,
    debug: bool = False,
    revision: Optional[str] = None,
    stream: Any = None,
) -> SafeJsonFormatter:
    """Configure root, Uvicorn and third-party loggers with SafeJsonFormatter.

    Safe to call early (before router/service imports) and idempotent across calls.
    Redaction is unconditional: `debug=True` adjusts log level only, never re-enabling
    raw messages, SQL, payloads, or credentials.
    """
    global _cached_env, _cached_revision

    _cached_env = _sanitize_env(environment or os.environ.get("ENVIRONMENT", "local"))
    _cached_revision = _sanitize_revision(
        revision or os.environ.get("K_REVISION") or os.environ.get("APP_REVISION")
    )

    formatter = SafeJsonFormatter(environment=_cached_env, revision=_cached_revision)
    level = logging.DEBUG if debug else logging.INFO

    root = logging.getLogger()
    root.setLevel(level)

    # Replace existing StreamHandlers or attach our single safe stdout handler.
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(formatter)
    handler._ts_safe_handler = True  # type: ignore[attr-defined]

    # Preserve non-stream handlers (e.g. pytest caplog) while attaching our formatter
    # to any stream handler so nothing bypasses sanitization.
    kept_handlers: List[logging.Handler] = []
    for existing in list(root.handlers):
        if getattr(existing, "_ts_safe_handler", False):
            continue
        if isinstance(existing, logging.StreamHandler) and not isinstance(existing, logging.FileHandler):
            continue
        # Ensure even non-stream handlers (like custom test handlers if not caplog) stay safe
        kept_handlers.append(existing)

    root.handlers = kept_handlers + [handler]

    # Normalize Uvicorn loggers so they route through the same safe formatter.
    for uv_name in ("uvicorn", "uvicorn.error"):
        uv_log = logging.getLogger(uv_name)
        uv_log.handlers = []
        uv_log.propagate = True
        uv_log.setLevel(logging.INFO)

    uv_access = logging.getLogger("uvicorn.access")
    uv_access.handlers = []
    uv_access.propagate = True
    if not any(isinstance(f, _SuppressRawUvicornAccessFilter) for f in uv_access.filters):
        uv_access.addFilter(_SuppressRawUvicornAccessFilter())

    # Dampen noisy SDK loggers and ensure they cannot bypass root sanitization.
    for sdk_name in _NOISY_SDK_LOGGERS:
        sdk_log = logging.getLogger(sdk_name)
        sdk_log.handlers = []
        sdk_log.propagate = True
        if sdk_log.level == logging.NOTSET or sdk_log.level < logging.WARNING:
            sdk_log.setLevel(logging.WARNING)

    return formatter
