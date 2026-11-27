"""Comprehensive TS-OBS-001 backend observability, privacy, readiness, telemetry, and load-guard tests.

Covers OBS-01, OBS-02, OBS-04, OBS-05, OBS-06, OBS-07, OBS-08, OBS-10, OBS-12, OBS-15, OBS-16, OBS-20, OBS-27.
"""

from __future__ import annotations

import importlib.util
import io
import json
import logging
import sys
import time
import uuid
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import BackgroundTasks, FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

from varavu_selavu_service.api.telemetry import reset_telemetry_rate_limits
from varavu_selavu_service.core.observability import (
    FALLBACK_LOG_LINE,
    SafeJsonFormatter,
    bind_request_context,
    configure_logging,
    extract_safe_frames,
    get_request_id,
    log_event,
    reset_request_context,
)
from varavu_selavu_service.core.observability.background import schedule_background_task
from varavu_selavu_service.core.observability.middleware import ObservabilityMiddleware
from varavu_selavu_service.core.observability.readiness import check_database_readiness
from varavu_selavu_service.services.email_service import send_email, send_transactional_email

REPO_ROOT = Path(__file__).resolve().parents[2]

SENTINELS = (
    "SENTINEL_EMAIL_991@example.com",
    "SENTINEL_TOKEN_882_SECRET",
    "SENTINEL_SQL_PARAM_773",
    "SENTINEL_RECEIPT_BODY_664",
    "SENTINEL_MERCHANT_555",
    "SENTINEL_PROMPT_446",
)


def _assert_no_sentinels(text: str) -> None:
    for s in SENTINELS:
        assert s not in text, f"Sentinel leaked into output: {s}"


# ---------------------------------------------------------------------------
# OBS-01 & OBS-02: Privacy boundary, DEBUG mode, hostile exceptions, fallback
# ---------------------------------------------------------------------------


def test_obs01_safe_formatter_blocks_third_party_and_debug_sentinels():
    buf = io.StringIO()
    configure_logging(environment="production", debug=True, revision="rev-1234", stream=buf)

    # Raw third-party logger with every sentinel in message, args, and extras
    sdk_logger = logging.getLogger("sqlalchemy.engine")
    sdk_logger.setLevel(logging.DEBUG)
    sdk_logger.error(
        "SELECT * FROM expenses WHERE email=%s AND token=%s AND merchant=%s",
        SENTINELS[0],
        SENTINELS[1],
        SENTINELS[4],
        extra={"sql_param": SENTINELS[2], "body": SENTINELS[3], "prompt": SENTINELS[5]},
    )

    # Safe adapter drops unknown extras while keeping allowlisted fields
    log_event(
        "varavu_selavu.test",
        logging.INFO,
        "ai_usage",
        component="llm",
        feature="chat",
        input_tokens=42,
        output_tokens=17,
        est_cost_usd=0.0012,
        user_email=SENTINELS[0],
        raw_prompt=SENTINELS[5],
    )

    # Raw uvicorn.access with sensitive query string is suppressed
    uv_access = logging.getLogger("uvicorn.access")
    uv_access.info(
        '%s - "%s %s HTTP/%s" %d',
        "203.0.113.10",
        "GET",
        f"/oauth/callback?code={SENTINELS[1]}&merchant={SENTINELS[4]}",
        "1.1",
        200,
    )

    output = buf.getvalue()
    _assert_no_sentinels(output)
    assert "203.0.113.10" not in output

    lines = [json.loads(line) for line in output.strip().splitlines() if line.strip()]
    assert any(l["event"] == "third_party_log" and l["logger"] == "sqlalchemy.engine" for l in lines)
    ai_line = next(l for l in lines if l["event"] == "ai_usage")
    assert ai_line["input_tokens"] == 42
    assert ai_line["revision"] == "rev-1234"
    assert "user_email" not in ai_line
    assert "raw_prompt" not in ai_line


def test_obs02_hostile_exception_and_formatter_fallback():
    class HostileError(RuntimeError):
        def __str__(self) -> str:
            raise RuntimeError(f"boom {SENTINELS[1]}")

        def __repr__(self) -> str:
            raise RuntimeError(f"boom {SENTINELS[2]}")

    buf = io.StringIO()
    configure_logging(environment="local", debug=True, stream=buf)

    try:
        try:
            raise ValueError(f"inner secret {SENTINELS[0]} {SENTINELS[2]}")
        except ValueError as inner:
            raise HostileError(f"outer secret {SENTINELS[3]}") from inner
    except HostileError as exc:
        log_event("varavu_selavu.test", logging.ERROR, "hostile_test", exc_info=exc, outcome="failed")

    out = buf.getvalue()
    _assert_no_sentinels(out)
    parsed = json.loads(out.strip().splitlines()[-1])
    assert parsed["event"] == "hostile_test"
    assert parsed["error_type"] == "HostileError"
    assert isinstance(parsed.get("frames"), list) and len(parsed["frames"]) <= 40
    for f in parsed["frames"]:
        assert set(f.keys()) == {"module", "function", "line"}
        assert not f["module"].startswith("/Users/")

    # Formatter exception must emit fixed static fallback and never raise
    fmt = SafeJsonFormatter(environment="production")
    with patch.object(fmt, "_format_safe", side_effect=RuntimeError(SENTINELS[1])):
        rec = logging.LogRecord("x", logging.ERROR, "f", 1, SENTINELS[0], (), None)
        res = fmt.format(rec)
    assert res == FALLBACK_LOG_LINE
    _assert_no_sentinels(res)


# ---------------------------------------------------------------------------
# OBS-05: Email service never emits bodies, subjects, addresses, or links
# ---------------------------------------------------------------------------


def test_obs05_email_service_never_logs_mime_subject_or_token():
    buf = io.StringIO()
    configure_logging(environment="local", debug=True, stream=buf)

    for env_name in ("local", "production"):
        with patch("varavu_selavu_service.services.email_service._settings") as mock_settings:
            mock_settings.MAIL_USERNAME = ""
            mock_settings.MAIL_PASSWORD = ""
            mock_settings.MAIL_FROM = "noreply@example.com"
            mock_settings.MAIL_TO = "admin@example.com"
            mock_settings.MAIL_SERVER = "smtp.gmail.com"
            mock_settings.MAIL_PORT = 587
            mock_settings.ENVIRONMENT = env_name

            assert send_transactional_email(
                to_email=SENTINELS[0],
                subject=f"Reset for {SENTINELS[4]}",
                heading="Reset",
                body_html=SENTINELS[3],
                cta_label="Click",
                cta_url=f"https://example.com/reset?token={SENTINELS[1]}",
            )
            assert send_email(
                form_type="contact",
                user_email=SENTINELS[0],
                subject=f"Subject {SENTINELS[4]}",
                message_body=SENTINELS[3],
                name="Test User",
            )

    out = buf.getvalue()
    _assert_no_sentinels(out)
    assert "Mock Email Output" not in out
    assert "email_delivery" in out


# ---------------------------------------------------------------------------
# OBS-06 & OBS-07: Pure ASGI timing, server request ID, streaming & background
# ---------------------------------------------------------------------------


def test_obs06_obs07_asgi_timing_request_id_and_background_isolation():
    buf = io.StringIO()
    configure_logging(environment="test", debug=False, stream=buf)

    mini = FastAPI()
    mini.add_middleware(ObservabilityMiddleware)

    @mini.get("/api/v1/items/{item_id}")
    async def get_item(item_id: str, background_tasks: BackgroundTasks):
        def _fail_bg():
            raise RuntimeError(f"bg failure {SENTINELS[0]}")

        schedule_background_task(background_tasks, "insights_aggregation", _fail_bg)
        return {"ok": True}

    @mini.get("/api/v1/stream")
    async def stream_body():
        async def _gen():
            yield b"chunk1-"
            time.sleep(0.03)
            yield b"chunk2"

        return StreamingResponse(_gen(), media_type="text/plain")

    client = TestClient(mini)
    hostile_id = f"hostile-{SENTINELS[1]}"
    r1 = client.get(f"/api/v1/items/{SENTINELS[4]}", headers={"X-Request-ID": hostile_id})
    assert r1.status_code == 200
    server_req_id = r1.headers.get("X-Request-ID")
    assert server_req_id and server_req_id != hostile_id
    uuid.UUID(server_req_id)  # valid server UUID4

    r2 = client.get("/api/v1/stream")
    assert r2.status_code == 200
    assert r2.text == "chunk1-chunk2"

    r3 = client.get(f"/api/v1/does-not-exist/{SENTINELS[4]}")
    assert r3.status_code == 404

    # Context must be cleanly reset outside request scope
    assert get_request_id() is None

    out = buf.getvalue()
    _assert_no_sentinels(out)
    records = [json.loads(l) for l in out.strip().splitlines() if l.strip()]

    api_events = [r for r in records if r["event"] == "api_request_completed"]
    assert len(api_events) == 3

    item_ev = next(e for e in api_events if e["route"] == "/api/v1/items/{item_id}")
    assert item_ev["request_id"] == server_req_id
    assert item_ev["outcome"] == "success"
    assert item_ev["operation_class"] == "core_read"

    stream_ev = next(e for e in api_events if e["route"] == "/api/v1/stream")
    assert stream_ev["duration_ms"] >= 25.0  # body-complete timing includes streaming delay

    unmatched_ev = next(e for e in api_events if e["route"] == "unmatched")
    assert unmatched_ev["status"] == 404
    assert unmatched_ev["outcome"] == "not_found"

    # Post-response background failure logged separately with originating request_id
    bg_failed = next(r for r in records if r["event"] == "background_task" and r["outcome"] == "failed")
    assert bg_failed["task_type"] == "insights_aggregation"
    assert bg_failed["request_id"] == server_req_id
    assert bg_failed["error_type"] == "RuntimeError"


# ---------------------------------------------------------------------------
# OBS-10: Healthz independent vs bounded Readyz
# ---------------------------------------------------------------------------


def test_obs10_readiness_bounded_timeout_and_generic_error():
    class StallingEngine:
        def connect(self):
            time.sleep(2.0)
            raise RuntimeError(f"db secret {SENTINELS[2]}")

    t0 = time.monotonic()
    ok, duration_ms = check_database_readiness(
        db_url="sqlite:///:memory:",
        engine_override=StallingEngine(),  # type: ignore[arg-type]
        timeout_sec=0.15,
    )
    elapsed = time.monotonic() - t0
    assert ok is False
    assert elapsed < 0.6
    assert duration_ms >= 100.0


# ---------------------------------------------------------------------------
# OBS-15, OBS-16, OBS-27: Telemetry batch endpoint auth, schema, limits, flags
# ---------------------------------------------------------------------------


def test_obs15_obs16_obs27_telemetry_batch_contract(test_client, db_session):
    from varavu_selavu_service.auth.security import create_access_token, hash_password
    from varavu_selavu_service.db.models import User

    email = f"obs-tele-{uuid.uuid4().hex[:8]}@example.com"
    user = User(email=email, name="Obs Tester", password_hash=hash_password("TestPass123!"), email_verified=True)
    db_session.add(user)
    db_session.commit()
    token = create_access_token({"sub": email})
    auth_headers = {"Authorization": f"Bearer {token}"}
    client = test_client

    reset_telemetry_rate_limits()
    valid_payload = {
        "schema_version": 1,
        "events": [
            {
                "name": "save_confirmed",
                "operation": "personal_expense_create",
                "platform": "web",
                "outcome": "confirmed",
                "duration_ms": 420,
                "request_id": "00000000-0000-4000-8000-000000000001",
            },
            {
                "name": "web_vital",
                "operation": "cls",
                "platform": "web",
                "outcome": "measured",
                "value": 0.04,
                "unit": "score",
            },
            {
                "name": "client_error",
                "operation": "render",
                "platform": "web",
                "outcome": "failed",
                "error_type": "TypeError",
            },
        ],
    }

    # Disabled by default -> 404 (OBS-27 rollback / flag-off)
    r_disabled = client.post("/api/v1/telemetry/batch", json=valid_payload, headers=auth_headers)
    assert r_disabled.status_code == 404

    with patch("varavu_selavu_service.api.telemetry.Settings") as mock_settings_cls:
        mock_settings_cls.return_value.CLIENT_DIAGNOSTICS_ENABLED = True

        # Unauthenticated -> 401 (temporarily remove conftest's auth_required override)
        from varavu_selavu_service.auth.security import auth_required
        from varavu_selavu_service.main import app as main_app

        saved_override = main_app.dependency_overrides.pop(auth_required, None)
        try:
            r_unauth = client.post("/api/v1/telemetry/batch", json=valid_payload)
            assert r_unauth.status_code == 401
        finally:
            if saved_override is not None:
                main_app.dependency_overrides[auth_required] = saved_override

        # Valid batch -> 204
        buf = io.StringIO()
        configure_logging(environment="test", debug=True, stream=buf)
        r_ok = client.post("/api/v1/telemetry/batch", json=valid_payload, headers=auth_headers)
        assert r_ok.status_code == 204
        # Principal email must never be logged
        assert email not in buf.getvalue()

        # Unknown key rejected with generic 400 and no echo
        bad_extra = {
            "schema_version": 1,
            "events": [
                {
                    "name": "client_error",
                    "operation": "render",
                    "platform": "web",
                    "outcome": "failed",
                    "message": SENTINELS[3],
                }
            ],
        }
        r_bad = client.post("/api/v1/telemetry/batch", json=bad_extra, headers=auth_headers)
        assert r_bad.status_code == 400
        assert SENTINELS[3] not in r_bad.text

        # Non-finite JSON constant (NaN / Infinity) rejected -> 400
        r_nan = client.post(
            "/api/v1/telemetry/batch",
            content='{"schema_version":1,"events":[{"name":"dashboard_ready","operation":"dashboard","platform":"web","outcome":"success","duration_ms":NaN}]}',
            headers={**auth_headers, "Content-Type": "application/json"},
        )
        assert r_nan.status_code == 400

        # Incompatible combination: web_vital on ios -> 400
        r_ios_vital = client.post(
            "/api/v1/telemetry/batch",
            json={
                "schema_version": 1,
                "events": [
                    {
                        "name": "web_vital",
                        "operation": "lcp",
                        "platform": "ios",
                        "outcome": "measured",
                        "duration_ms": 1200,
                    }
                ],
            },
            headers=auth_headers,
        )
        assert r_ios_vital.status_code == 400

        # Oversized body (>8 KiB) -> 413 before parsing
        big_body = "x" * 9000
        r_big = client.post(
            "/api/v1/telemetry/batch",
            content=big_body,
            headers={**auth_headers, "Content-Type": "application/json"},
        )
        assert r_big.status_code == 413

        # Rate limit: 6 batches/minute/principal -> 7th gets 429
        reset_telemetry_rate_limits()
        for _ in range(6):
            assert client.post("/api/v1/telemetry/batch", json=valid_payload, headers=auth_headers).status_code == 204
        assert client.post("/api/v1/telemetry/batch", json=valid_payload, headers=auth_headers).status_code == 429


# ---------------------------------------------------------------------------
# OBS-12 & OBS-20: Ops config validator & load-harness fail-closed target guard
# ---------------------------------------------------------------------------


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_obs12_ops_observability_configs_validate_and_gate_apply():
    apply_mod = _load_module("ops_obs_apply", REPO_ROOT / "ops/observability/apply.py")
    assert apply_mod.validate_configs() == []
    # Dry-run succeeds
    assert apply_mod.main([]) == 0
    # --apply without explicit confirmation refuses
    assert apply_mod.main(["--apply", "--project", "demo"]) == 2


def test_obs20_load_target_guard_fails_closed():
    guard_mod = _load_module("qa_load_target_guard", REPO_ROOT / "qa/load/target_guard.py")
    # Ensure qa/load is on sys.path for seed_fixtures / verify_correctness
    sys.path.insert(0, str(REPO_ROOT / "qa/load"))
    seed_mod = _load_module("qa_load_seed_fixtures", REPO_ROOT / "qa/load/seed_fixtures.py")
    verify_mod = _load_module("qa_load_verify_correctness", REPO_ROOT / "qa/load/verify_correctness.py")

    # Rejects production hosts even if allowlisted
    with pytest.raises(guard_mod.TargetGuardError):
        guard_mod.validate_load_target(
            base_url="https://trackspense-api.cerebroos.com",
            env={
                "LOAD_TEST_TARGET_ALLOWLIST": "trackspense-api.cerebroos.com",
                "LOAD_TEST_RUN_MARKER": "ts-load-1",
                "LOAD_TEST_NON_LOCAL_AUTHORIZED": "true",
            },
        )

    # Rejects missing run marker
    with pytest.raises(guard_mod.TargetGuardError):
        guard_mod.validate_load_target(
            base_url="http://127.0.0.1:18080",
            env={"LOAD_TEST_TARGET_ALLOWLIST": "127.0.0.1"},
        )

    # Rejects non-local target without explicit authorization
    with pytest.raises(guard_mod.TargetGuardError):
        guard_mod.validate_load_target(
            base_url="https://staging-api.example.test",
            env={
                "LOAD_TEST_TARGET_ALLOWLIST": "staging-api.example.test",
                "LOAD_TEST_RUN_MARKER": "ts-load-stage-1",
            },
        )

    # Rejects redirect to production
    with pytest.raises(guard_mod.TargetGuardError):
        guard_mod.validate_load_target(
            base_url="http://127.0.0.1:18080",
            env={
                "LOAD_TEST_TARGET_ALLOWLIST": "127.0.0.1",
                "LOAD_TEST_RUN_MARKER": "ts-load-local-1",
            },
            redirect_locations=["https://expense.cerebroos.com/login"],
        )

    # Rejects SQLite when require_postgres=True
    with pytest.raises(guard_mod.TargetGuardError):
        guard_mod.validate_load_target(
            base_url="http://127.0.0.1:18080",
            db_url="sqlite:///./test.db",
            require_postgres=True,
            env={
                "LOAD_TEST_TARGET_ALLOWLIST": "127.0.0.1",
                "LOAD_TEST_RUN_MARKER": "ts-load-local-1",
            },
        )

    # Accepts explicit isolated local target with PostgreSQL
    ok = guard_mod.validate_load_target(
        base_url="http://127.0.0.1:18080",
        db_url="postgresql://user:pass@127.0.0.1:5432/trackspense_load",
        require_postgres=True,
        env={
            "LOAD_TEST_TARGET_ALLOWLIST": "127.0.0.1",
            "LOAD_TEST_RUN_MARKER": "ts-load-local-1",
        },
    )
    assert ok.is_local is True
    assert "pass" not in (ok.db_fingerprint or "")

    # Deterministic synthetic fixture plan & exact Decimal reconciliation
    plan = seed_mod.build_synthetic_plan("smoke", 42, "ts-load-local-1")
    assert plan["account_count"] == 10
    assert plan["total_expenses"] == 100
    assert Decimal(plan["expected_total_amount"]) > Decimal("0.00")

    rec = verify_mod.verify_totals(
        source_merchant_total=Decimal("100.25"),
        agg_merchant_total=Decimal("100.25"),
        source_item_total=Decimal("40.10"),
        agg_item_total=Decimal("40.10"),
    )
    assert rec["all_reconciled"] is True
