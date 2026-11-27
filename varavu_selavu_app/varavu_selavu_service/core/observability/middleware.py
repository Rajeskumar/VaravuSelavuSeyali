"""Pure ASGI request correlation and body-complete timing middleware (TS-OBS-001 AC-04)."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, MutableMapping, Optional

from varavu_selavu_service.core.observability.context import (
    bind_request_context,
    get_db_metrics,
    new_request_id,
    reset_request_context,
    validate_cloud_trace_id,
)
from varavu_selavu_service.core.observability.sanitizer import (
    log_event,
    safe_error_type,
)

_logger = logging.getLogger("varavu_selavu_service.http")

_PROBE_PATHS = frozenset({"/api/v1/healthz", "/api/v1/readyz", "/healthz", "/readyz"})
_TELEMETRY_PATHS = frozenset({"/api/v1/telemetry/batch"})


def classify_operation_class(route: str, method: str) -> str:
    if route in _PROBE_PATHS:
        return "probe"
    if route in _TELEMETRY_PATHS:
        return "telemetry"
    if route.startswith(("/api/v1/auth/", "/oauth/")):
        return "auth"
    if route.startswith("/api/v1/ingest/receipt"):
        return "receipt"
    if (
        route.startswith(("/api/v1/chat", "/api/v1/ai/", "/api/v1/categorize"))
        or "/ask" in route
    ):
        return "ai"
    if route.startswith("/api/v1/") and route != "unmatched":
        if method in ("GET", "HEAD", "OPTIONS"):
            return "core_read"
        return "core_write"
    return "other"


def classify_outcome(status: Optional[int], *, cancelled: bool = False, errored: bool = False) -> str:
    if cancelled:
        return "cancelled"
    if errored or status is None:
        return "server_error"
    if 200 <= status < 400:
        return "success"
    if status in (401, 403):
        return "auth_rejected"
    if status == 404:
        return "not_found"
    if status == 429:
        return "rate_limited"
    if 400 <= status < 500:
        return "client_error"
    return "server_error"


def _extract_route_template(scope: MutableMapping[str, Any]) -> str:
    route = scope.get("route")
    path = getattr(route, "path", None)
    if isinstance(path, str) and path.startswith("/"):
        return path
    # Fallback for mounted static root routes like "/" or "/privacy-policy" only if matched
    raw_path = scope.get("path", "")
    if raw_path in _PROBE_PATHS or raw_path in ("/", "/privacy-policy", "/terms-of-service"):
        return raw_path
    return "unmatched"


def _get_header(scope: MutableMapping[str, Any], name: bytes) -> Optional[str]:
    for k, v in scope.get("headers") or ():
        if k.lower() == name:
            try:
                return v.decode("latin-1")
            except Exception:
                return None
    return None


class ObservabilityMiddleware:
    """Pure ASGI middleware measuring full request duration through final response body send.

    - Always generates a fresh server-owned UUID4 request ID (ignores incoming X-Request-ID).
    - Injects `X-Request-ID` on every HTTP response (including errors).
    - Emits exactly one `api_request_completed` event per HTTP request.
    - Resets request ContextVars in `finally` so context never leaks across requests/threads.
    """

    def __init__(self, app: Callable[..., Any]) -> None:
        self.app = app

    async def __call__(self, scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        request_id = new_request_id()
        trace_id = validate_cloud_trace_id(_get_header(scope, b"x-cloud-trace-context"))
        tokens = bind_request_context(request_id=request_id, trace_id=trace_id, with_db_metrics=True)
        scope.setdefault("state", {})
        if isinstance(scope["state"], dict):
            scope["state"]["request_id"] = request_id

        start = time.monotonic()
        body_complete_at: Optional[float] = None
        status_code: Optional[int] = None
        cancelled = False
        unhandled_exc: Optional[BaseException] = None

        async def send_wrapper(message: MutableMapping[str, Any]) -> None:
            nonlocal status_code, body_complete_at
            msg_type = message.get("type")
            if msg_type == "http.response.start":
                status_code = int(message.get("status", 500))
                headers = list(message.get("headers") or [])
                # Replace any existing X-Request-ID header with our server-generated UUID.
                headers = [(k, v) for (k, v) in headers if k.lower() != b"x-request-id"]
                headers.append((b"x-request-id", request_id.encode("ascii")))
                message["headers"] = headers
            elif msg_type == "http.response.body":
                if not message.get("more_body", False):
                    body_complete_at = time.monotonic()
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except asyncio.CancelledError:
            cancelled = True
            raise
        except BaseException as exc:
            unhandled_exc = exc
            raise
        finally:
            end = body_complete_at if body_complete_at is not None else time.monotonic()
            duration_ms = max(0.0, (end - start) * 1000.0)
            route = _extract_route_template(scope)
            method = str(scope.get("method", "OTHER")).upper()
            op_class = classify_operation_class(route, method)
            outcome = classify_outcome(
                status_code,
                cancelled=cancelled,
                errored=unhandled_exc is not None,
            )

            fields: dict[str, Any] = {
                "route": route,
                "method": method,
                "status": status_code if status_code is not None else (499 if cancelled else 500),
                "outcome": outcome,
                "operation_class": op_class,
                "duration_ms": round(duration_ms, 2),
                "request_id": request_id,
            }

            db_metrics = get_db_metrics()
            if db_metrics is not None:
                if db_metrics.query_count > 0:
                    fields["query_count"] = db_metrics.query_count
                    fields["db_query_ms"] = round(db_metrics.query_ms, 2)
                if db_metrics.acquire_ms > 0:
                    fields["db_acquire_ms"] = round(db_metrics.acquire_ms, 2)
                if db_metrics.commit_ms > 0:
                    fields["db_commit_ms"] = round(db_metrics.commit_ms, 2)
                if db_metrics.acquire_timeouts > 0:
                    fields["acquire_timeouts"] = db_metrics.acquire_timeouts

            if unhandled_exc is not None:
                fields["error_type"] = safe_error_type(unhandled_exc)

            level = (
                logging.ERROR
                if outcome == "server_error"
                else (logging.WARNING if outcome in ("rate_limited", "cancelled") else logging.INFO)
            )
            log_event(
                _logger,
                level,
                "api_request_completed",
                exc_info=unhandled_exc if unhandled_exc is not None else False,
                **fields,
            )
            reset_request_context(tokens)
