"""Authenticated, feature-flagged client diagnostics ingestion (TS-OBS-001 AC-08).

- Disabled by default (`CLIENT_DIAGNOSTICS_ENABLED=false` -> 404).
- Enforces existing cookie+CSRF and Bearer auth via `auth_required` + `CSRFMiddleware`.
- Enforces 8 KiB body cap BEFORE JSON parsing (including chunked requests -> 413).
- Strict closed schema allowlist: rejects unknown keys, NaN/Infinity, bad enums, or
  incompatible name/operation/outcome/platform/measurement combinations with generic 400
  without echoing or logging any rejected payload.
- Per-principal per-instance rate limit: 6 batches/minute (never logs principal identity).
"""

from __future__ import annotations

import json
import logging
import math
import re
import threading
import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.core.observability import log_event
from varavu_selavu_service.core.observability.context import validate_request_id

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry"])
_logger = logging.getLogger("varavu_selavu_service.telemetry")

MAX_BODY_BYTES = 8 * 1024  # 8 KiB before parsing
MAX_EVENTS_PER_BATCH = 10
MAX_BATCHES_PER_MINUTE = 6
RATE_WINDOW_SEC = 60.0

_BUILD_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$")

_PLATFORMS = frozenset({"web", "ios", "android"})
_ERROR_TYPES = frozenset(
    {"Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "RequestError", "other"}
)

_API_OPS = frozenset(
    {"expense_list", "analysis", "insight_list", "group_detail", "receipt_parse", "ai_query"}
)
_API_OUTCOMES = frozenset(
    {"success", "rejected", "failed", "timeout", "network_error", "cancelled"}
)
_SAVE_OPS = frozenset(
    {
        "personal_expense_create",
        "personal_expense_update",
        "group_expense_create",
        "group_expense_update",
        "settlement_create",
    }
)
_SAVE_OUTCOME_BY_NAME = {
    "save_confirmed": "confirmed",
    "save_failed": "rejected",
    "save_unknown": "unknown",
}
_WEB_VITAL_TIME_OPS = frozenset({"lcp", "inp"})
_CLIENT_ERROR_OPS = frozenset({"render", "chunk_load", "unhandled_rejection"})

_ENVELOPE_KEYS = frozenset({"schema_version", "events"})

_rate_lock = threading.Lock()
_rate_buckets: Dict[str, Deque[float]] = defaultdict(deque)


def reset_telemetry_rate_limits() -> None:
    """Clear in-memory telemetry rate buckets (for tests)."""
    with _rate_lock:
        _rate_buckets.clear()


def _check_rate_limit(principal: str) -> bool:
    now = time.monotonic()
    cutoff = now - RATE_WINDOW_SEC
    with _rate_lock:
        if len(_rate_buckets) > 2000:
            stale = [k for k, dq in _rate_buckets.items() if not dq or dq[-1] <= cutoff]
            for k in stale:
                del _rate_buckets[k]
        bucket = _rate_buckets[principal]
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= MAX_BATCHES_PER_MINUTE:
            return False
        bucket.append(now)
        return True


def _reject_bad_constant(_val: str) -> Any:
    raise ValueError("non-finite JSON constant")


def _is_finite_number(val: Any) -> bool:
    return isinstance(val, (int, float)) and not isinstance(val, bool) and math.isfinite(val)


def _validate_event(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("event must be an object")

    name = raw.get("name")
    operation = raw.get("operation")
    platform = raw.get("platform")
    outcome = raw.get("outcome")

    if not isinstance(name, str) or not isinstance(operation, str) or not isinstance(platform, str) or not isinstance(outcome, str):
        raise ValueError("missing required string fields")
    if platform not in _PLATFORMS:
        raise ValueError("invalid platform")

    # Optional build ID (log field only)
    build = raw.get("build")
    if build is not None:
        if not isinstance(build, str) or not _BUILD_RE.match(build):
            raise ValueError("invalid build")

    # Base allowed keys depend strictly on event name + operation
    allowed_keys = {"name", "operation", "platform", "outcome", "build"}
    clean: Dict[str, Any] = {
        "action": name,
        "operation": operation,
        "platform": platform,
        "outcome": outcome,
    }
    if build is not None:
        clean["build"] = build

    if name == "api_completed":
        if operation not in _API_OPS or outcome not in _API_OUTCOMES:
            raise ValueError("invalid api_completed operation or outcome")
        allowed_keys |= {"duration_ms", "request_id"}
        dur = raw.get("duration_ms")
        if not _is_finite_number(dur) or not (0 <= float(dur) <= 300_000):
            raise ValueError("invalid duration_ms")
        clean["duration_ms"] = round(float(dur), 2)
        clean["unit"] = "ms"
        if "request_id" in raw and raw["request_id"] is not None:
            rid = validate_request_id(raw["request_id"])
            if not rid:
                raise ValueError("invalid request_id")
            clean["request_id"] = rid

    elif name == "dashboard_ready":
        if operation != "dashboard" or outcome not in ("success", "failed"):
            raise ValueError("invalid dashboard_ready")
        allowed_keys |= {"duration_ms"}
        dur = raw.get("duration_ms")
        if not _is_finite_number(dur) or not (0 <= float(dur) <= 300_000):
            raise ValueError("invalid duration_ms")
        clean["duration_ms"] = round(float(dur), 2)
        clean["unit"] = "ms"

    elif name in _SAVE_OUTCOME_BY_NAME:
        if operation not in _SAVE_OPS or outcome != _SAVE_OUTCOME_BY_NAME[name]:
            raise ValueError("invalid save event")
        allowed_keys |= {"duration_ms", "request_id"}
        dur = raw.get("duration_ms")
        if not _is_finite_number(dur) or not (0 <= float(dur) <= 300_000):
            raise ValueError("invalid duration_ms")
        clean["duration_ms"] = round(float(dur), 2)
        clean["unit"] = "ms"
        if "request_id" in raw and raw["request_id"] is not None:
            rid = validate_request_id(raw["request_id"])
            if not rid:
                raise ValueError("invalid request_id")
            clean["request_id"] = rid

    elif name == "web_vital":
        if platform != "web" or outcome != "measured":
            raise ValueError("web_vital is web-only with outcome=measured")
        if operation in _WEB_VITAL_TIME_OPS:
            allowed_keys |= {"duration_ms", "unit"}
            dur = raw.get("duration_ms")
            if not _is_finite_number(dur) or not (0 <= float(dur) <= 300_000):
                raise ValueError("invalid web_vital duration_ms")
            if "unit" in raw and raw["unit"] is not None and raw["unit"] != "ms":
                raise ValueError("invalid web_vital unit")
            clean["duration_ms"] = round(float(dur), 2)
            clean["unit"] = "ms"
        elif operation == "cls":
            allowed_keys |= {"value", "unit"}
            val = raw.get("value")
            unit = raw.get("unit")
            if not _is_finite_number(val) or not (0 <= float(val) <= 10):
                raise ValueError("invalid cls value")
            if unit != "score":
                raise ValueError("cls requires unit=score")
            clean["value"] = round(float(val), 4)
            clean["unit"] = "score"
        else:
            raise ValueError("invalid web_vital operation")

    elif name == "client_error":
        if operation not in _CLIENT_ERROR_OPS or outcome != "failed":
            raise ValueError("invalid client_error")
        allowed_keys |= {"error_type"}
        if "error_type" in raw and raw["error_type"] is not None:
            et = raw["error_type"]
            if not isinstance(et, str) or et not in _ERROR_TYPES:
                raise ValueError("invalid error_type")
            clean["error_type"] = et

    else:
        raise ValueError("unknown event name")

    # Reject any unknown/extra keys without echoing them.
    if set(raw.keys()) - allowed_keys:
        raise ValueError("unknown event field")

    return clean


async def _read_bounded_body(request: Request, max_bytes: int = MAX_BODY_BYTES) -> bytes:
    cl = request.headers.get("content-length")
    if cl is not None:
        try:
            if int(cl) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Payload too large",
                )
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request")

    chunks: List[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Payload too large",
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/batch", status_code=status.HTTP_204_NO_CONTENT)
async def ingest_telemetry_batch(
    request: Request,
    user_id: str = Depends(auth_required),
) -> Response:
    settings_now = Settings()
    if not settings_now.CLIENT_DIAGNOSTICS_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    if not _check_rate_limit(user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )

    raw_bytes = await _read_bounded_body(request, MAX_BODY_BYTES)
    if not raw_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid telemetry batch")

    try:
        parsed = json.loads(raw_bytes.decode("utf-8"), parse_constant=_reject_bad_constant)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid telemetry batch")

    if not isinstance(parsed, dict) or set(parsed.keys()) != _ENVELOPE_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid telemetry batch")

    if parsed.get("schema_version") != 1 or isinstance(parsed.get("schema_version"), bool):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid telemetry batch")

    events = parsed.get("events")
    if not isinstance(events, list) or not (1 <= len(events) <= MAX_EVENTS_PER_BATCH):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid telemetry batch")

    validated: List[Dict[str, Any]] = []
    try:
        for ev in events:
            validated.append(_validate_event(ev))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid telemetry batch")

    # Emit one normalized privacy-safe log event per validated client diagnostic.
    # Principal identity (`user_id`) is NEVER attached or logged.
    for ev_fields in validated:
        log_event(_logger, logging.INFO, "client_diagnostic", **ev_fields)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
