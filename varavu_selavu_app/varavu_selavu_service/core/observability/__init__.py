"""Privacy-safe structured observability package for TrackSpense backend (TS-OBS-001)."""

from varavu_selavu_service.core.observability.context import (
    DbRequestMetrics,
    bind_request_context,
    capture_task_context,
    get_db_metrics,
    get_request_id,
    get_trace_id,
    new_request_id,
    reset_request_context,
    validate_cloud_trace_id,
)
from varavu_selavu_service.core.observability.sanitizer import (
    FALLBACK_LOG_LINE,
    SafeJsonFormatter,
    configure_logging,
    extract_safe_frames,
    log_event,
    safe_error_type,
)

__all__ = [
    "DbRequestMetrics",
    "FALLBACK_LOG_LINE",
    "SafeJsonFormatter",
    "bind_request_context",
    "capture_task_context",
    "configure_logging",
    "extract_safe_frames",
    "get_db_metrics",
    "get_request_id",
    "get_trace_id",
    "log_event",
    "new_request_id",
    "reset_request_context",
    "safe_error_type",
    "validate_cloud_trace_id",
]
