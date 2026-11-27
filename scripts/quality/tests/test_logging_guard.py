"""Tests for scripts/quality/logging_guard.py (TS-OBS-001 OBS-03)."""

from pathlib import Path
import importlib.util

GUARD_PATH = Path(__file__).resolve().parents[1] / "logging_guard.py"
_spec = importlib.util.spec_from_file_location("logging_guard", GUARD_PATH)
assert _spec and _spec.loader
logging_guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(logging_guard)


def test_unsafe_backend_logger_calls_fail():
    unsafe = (
        'logger.error(f"Failed for user {email}: {exc}")\n'
        'logger.info("Agent step [tool]: %s", output)\n'
        'logger.exception("boom", extra={"response": text})\n'
    )
    findings = logging_guard.scan_text(
        "varavu_selavu_app/varavu_selavu_service/services/demo.py",
        unsafe,
        logging_guard.BACKEND_FORBIDDEN,
    )
    assert len(findings) == 3


def test_safe_log_event_adapter_passes():
    safe = (
        'log_event(logger, logging.INFO, "ai_usage", component="llm", outcome="completed", count=1)\n'
    )
    findings = logging_guard.scan_text(
        "varavu_selavu_app/varavu_selavu_service/services/demo.py",
        safe,
        logging_guard.BACKEND_FORBIDDEN,
    )
    assert findings == []


def test_unsafe_mobile_core_console_fails():
    findings = logging_guard.scan_text(
        "varavu_selavu_mobile/src/core/api/demo.ts",
        "console.error('leak', err);\n",
        logging_guard.MOBILE_CORE_FORBIDDEN,
    )
    assert len(findings) == 1


def test_repository_passes_logging_guard():
    findings = logging_guard.scan_repository()
    assert findings == [], f"Unexpected unsafe logging calls: {findings}"
