"""AI cost gating: per-user daily quotas, global spend cap, kill switch, model allowlist."""
import os
import threading
import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest

from varavu_selavu_service.api.routes import get_receipt_service
from varavu_selavu_service.db.models import AiUsageDaily, User
from varavu_selavu_service.models.api_models import ResolvedPeriod, ResolvedScope
from varavu_selavu_service.services import ai_quota_service
from varavu_selavu_service.services.ai_quota_service import (
    AiQuotaError,
    AiQuotaService,
    estimate_cost_usd,
    utc_today,
)
from varavu_selavu_service.services.categorization_service import CategorizationService
from varavu_selavu_service.services.chat_service import ChatResult
from varavu_selavu_service.services.receipt_service import ReceiptService

CHAT_URL = "/api/v1/analysis/chat"
QUESTION = {"messages": [{"role": "user", "content": "How much did I spend on food?"}]}
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


@pytest.fixture(autouse=True)
def _reset_spend_cache():
    ai_quota_service.reset_spend_cache()
    yield
    ai_quota_service.reset_spend_cache()


@pytest.fixture
def limits(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("AI_CHAT_DAILY_LIMIT", "2")
    monkeypatch.setenv("AI_RECEIPT_DAILY_LIMIT", "1")
    monkeypatch.setenv("AI_CATEGORIZE_DAILY_LIMIT", "1")
    monkeypatch.setenv("AI_GLOBAL_DAILY_BUDGET_USD", "100")
    monkeypatch.setenv("AI_REQUIRE_VERIFIED_EMAIL", "true")
    monkeypatch.setenv("AI_CHAT_ALLOWED_MODELS", "gemini:gemini-3.1-flash-lite")
    return monkeypatch


def _chat_result(input_tokens=1000, output_tokens=100, llm_called=True):
    return ChatResult(
        response="You spent $42 on food.",
        resolved_period=ResolvedPeriod(start_date="2026-09-01", end_date="2026-09-30", label="September 2026", source="default"),
        resolved_scope=ResolvedScope(kind="personal"),
        model_name="gemini-3.1-flash-lite",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        llm_called=llm_called,
    )


def _row(db, feature="chat"):
    db.expire_all()
    return (
        db.query(AiUsageDaily)
        .filter_by(user_email="test@user.com", feature=feature, day=utc_today())
        .first()
    )


def _user(db):
    return db.query(User).filter_by(email="test@user.com").one()


# --------------------------------------------------------------------------- chat


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_chat_quota_exhausts_with_429_and_reset_time(mock_chat, test_client, db_session, limits):
    mock_chat.return_value = _chat_result()
    assert test_client.post(CHAT_URL, json=QUESTION).status_code == 200
    assert test_client.post(CHAT_URL, json=QUESTION).status_code == 200

    res = test_client.post(CHAT_URL, json=QUESTION)
    assert res.status_code == 429
    detail = res.json()["detail"]
    assert detail["code"] == "ai_quota_exceeded"
    assert detail["feature"] == "chat"
    assert detail["limit"] == 2
    assert detail["resets_at"].startswith((utc_today() + timedelta(days=1)).isoformat())
    assert mock_chat.call_count == 2  # the third request never reached the model
    assert _row(db_session).count == 2


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_chat_settles_tokens_and_estimated_cost(mock_chat, test_client, db_session, limits):
    mock_chat.return_value = _chat_result(input_tokens=12_000, output_tokens=900)
    assert test_client.post(CHAT_URL, json=QUESTION).status_code == 200

    row = _row(db_session)
    assert (row.input_tokens, row.output_tokens) == (12_000, 900)
    expected = estimate_cost_usd("gemini-3.1-flash-lite", 12_000, 900)
    assert float(row.est_cost_usd) == pytest.approx(expected, abs=1e-6)


@patch("varavu_selavu_service.api.routes.call_chat_model", side_effect=RuntimeError("provider down"))
def test_chat_failure_refunds_the_unit(mock_chat, test_client, db_session, limits):
    assert test_client.post(CHAT_URL, json=QUESTION).status_code == 503
    assert _row(db_session).count == 0


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_chat_answered_without_llm_is_refunded(mock_chat, test_client, db_session, limits):
    mock_chat.return_value = _chat_result(llm_called=False)
    assert test_client.post(CHAT_URL, json=QUESTION).status_code == 200
    assert _row(db_session).count == 0


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_ask_why_shares_the_chat_pool(mock_chat, test_client, db_session, limits):
    limits.setenv("AI_CHAT_DAILY_LIMIT", "1")
    mock_chat.return_value = _chat_result()
    assert test_client.post(CHAT_URL, json=QUESTION).status_code == 200

    budget = test_client.post("/api/v1/budgets", json={"target_type": "category", "category": "Dining out", "amount": 100.0})
    assert budget.status_code in (200, 201), budget.text
    res = test_client.post(f"/api/v1/budgets/{budget.json()['id']}/ask-why")
    assert res.status_code == 429
    assert res.json()["detail"]["code"] == "ai_quota_exceeded"


# ----------------------------------------------------------------- access levels


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_blocked_user_gets_403(mock_chat, test_client, db_session, limits):
    _user(db_session).ai_access = "blocked"
    db_session.commit()
    res = test_client.post(CHAT_URL, json=QUESTION)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "ai_blocked"
    mock_chat.assert_not_called()


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_unlimited_user_bypasses_limit_but_is_counted(mock_chat, test_client, db_session, limits):
    mock_chat.return_value = _chat_result()
    _user(db_session).ai_access = "unlimited"
    db_session.commit()
    for _ in range(4):
        assert test_client.post(CHAT_URL, json=QUESTION).status_code == 200
    assert _row(db_session).count == 4


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_per_user_override_raises_the_limit(mock_chat, test_client, db_session, limits):
    mock_chat.return_value = _chat_result()
    _user(db_session).ai_limits_override = {"chat": 3}
    db_session.commit()
    codes = [test_client.post(CHAT_URL, json=QUESTION).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_unverified_email_gets_403(mock_chat, test_client, db_session, limits):
    _user(db_session).email_verified = False
    db_session.commit()
    res = test_client.post(CHAT_URL, json=QUESTION)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "email_not_verified"


# ------------------------------------------------------- global cap / kill switch


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_global_budget_pauses_ai_for_everyone(mock_chat, test_client, db_session, limits):
    limits.setenv("AI_GLOBAL_DAILY_BUDGET_USD", "0.0001")
    limits.setenv("AI_CHAT_DAILY_LIMIT", "10")
    mock_chat.return_value = _chat_result(input_tokens=100_000, output_tokens=10_000)
    assert test_client.post(CHAT_URL, json=QUESTION).status_code == 200

    res = test_client.post(CHAT_URL, json=QUESTION)
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "ai_paused"
    assert test_client.get("/api/v1/ai/usage").json()["paused"] is True


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_kill_switch_disables_ai(mock_chat, test_client, db_session, limits):
    limits.setenv("AI_ENABLED", "false")
    res = test_client.post(CHAT_URL, json=QUESTION)
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "ai_disabled"
    assert test_client.get("/api/v1/config").json()["ai_enabled"] is False
    mock_chat.assert_not_called()


# ---------------------------------------------------------------- model allowlist


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_non_allowlisted_model_is_rejected(mock_chat, test_client, db_session, limits):
    res = test_client.post(CHAT_URL, json={**QUESTION, "provider": "gemini", "model": "gemini-2.5-pro"})
    assert res.status_code == 400
    mock_chat.assert_not_called()
    assert _row(db_session) is None  # rejected before any quota was reserved


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_allowlisted_model_is_passed_through(mock_chat, test_client, db_session, limits):
    mock_chat.return_value = _chat_result()
    res = test_client.post(CHAT_URL, json={**QUESTION, "provider": "gemini", "model": "gemini-3.1-flash-lite"})
    assert res.status_code == 200
    assert mock_chat.call_args.kwargs["model"] == "gemini-3.1-flash-lite"
    assert mock_chat.call_args.kwargs["provider"] == "gemini"


def test_models_endpoint_lists_only_the_allowlist(test_client, db_session, limits):
    assert test_client.get("/api/v1/models").json() == {
        "models": [{"provider": "gemini", "id": "gemini-3.1-flash-lite", "name": "Gemini: gemini-3.1-flash-lite"}]
    }


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_oversized_question_is_rejected(mock_chat, test_client, db_session, limits):
    limits.setenv("AI_CHAT_MAX_INPUT_CHARS", "10")
    res = test_client.post(CHAT_URL, json={"messages": [{"role": "user", "content": "x" * 11}]})
    assert res.status_code == 422
    mock_chat.assert_not_called()


# --------------------------------------------------------- categorize / receipt


def test_categorize_falls_back_silently_when_over_quota(test_client, db_session, limits):
    with patch.object(
        CategorizationService, "llm_classify", return_value=("Food & Drink", "Dining out", "Subway")
    ) as mock_llm:
        # A description no local rule knows, so the LLM tier (the metered one) is reached.
        first = test_client.post("/api/v1/expenses/categorize", json={"description": "zqx vendor 42"})
        second = test_client.post("/api/v1/expenses/categorize", json={"description": "zqx vendor 42"})
    assert first.json()["main_category"] == "Food & Drink"
    assert second.status_code == 200
    body = second.json()
    assert (body["main_category"], body["subcategory"], body["merchant_name"]) == ("Other", "General", None)
    assert mock_llm.call_count == 1


def test_receipt_scan_is_metered(test_client, db_session, limits):
    app = test_client.app
    app.dependency_overrides[get_receipt_service] = lambda: ReceiptService(engine="gemini")
    parsed = {"header": {"merchant_name": "Store", "amount": 5}, "items": []}
    try:
        with patch.object(ReceiptService, "_call_gemini", return_value=parsed) as mock_gemini:
            files = {"file": ("r.png", PNG_MAGIC + b"data", "image/png")}
            assert test_client.post("/api/v1/ingest/receipt/parse", files=files).status_code == 200
            files = {"file": ("r.png", PNG_MAGIC + b"data", "image/png")}
            res = test_client.post("/api/v1/ingest/receipt/parse", files=files)
        assert res.status_code == 429
        assert res.json()["detail"]["feature"] == "receipt"
        assert mock_gemini.call_count == 1
        # No usage metadata came back, so the conservative fallback estimate was recorded.
        assert float(_row(db_session, "receipt").est_cost_usd) > 0
    finally:
        app.dependency_overrides.pop(get_receipt_service, None)


def test_rejected_upload_does_not_use_a_scan(test_client, db_session, limits):
    files = {"file": ("r.png", b"not a png", "image/png")}
    assert test_client.post("/api/v1/ingest/receipt/parse", files=files).status_code == 415
    assert _row(db_session, "receipt") is None


# --------------------------------------------------------------------- usage


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_usage_endpoint_reports_remaining(mock_chat, test_client, db_session, limits):
    mock_chat.return_value = _chat_result()
    test_client.post(CHAT_URL, json=QUESTION)
    body = test_client.get("/api/v1/ai/usage").json()
    assert body["features"]["chat"] == {"used": 1, "limit": 2, "remaining": 1}
    assert body["features"]["receipt"] == {"used": 0, "limit": 1, "remaining": 1}
    assert body["paused"] is False and body["ai_enabled"] is True and body["blocked"] is False


def test_account_deletion_cascades_usage_rows(db_session, limits):
    svc = AiQuotaService(db_session)
    svc.reserve("test@user.com", "chat")
    db_session.delete(_user(db_session))
    db_session.commit()
    assert db_session.query(AiUsageDaily).count() == 0


# ------------------------------------------------ concurrency (real Postgres)

PG_URL = os.environ.get("E2E_DATABASE_URL")


@pytest.mark.skipif(not PG_URL, reason="Requires E2E_DATABASE_URL (see run_e2e_pg_tests.sh)")
def test_concurrent_reserves_never_overshoot_on_postgres(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.dialects.postgresql import insert
    from sqlalchemy.orm import sessionmaker

    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("AI_CHAT_DAILY_LIMIT", "5")
    monkeypatch.setenv("AI_GLOBAL_DAILY_BUDGET_USD", "100")
    engine = create_engine(PG_URL, pool_size=20)
    Session = sessionmaker(bind=engine)
    email = f"quota-{uuid.uuid4().hex[:8]}@test.com"
    with Session() as db:
        db.execute(insert(User).values(id=uuid.uuid4(), email=email, password_hash="x", email_verified=True))
        db.commit()

    outcomes: list[str] = []
    lock = threading.Lock()

    def worker():
        with Session() as db:
            try:
                AiQuotaService(db).reserve(email, "chat")
                result = "ok"
            except AiQuotaError as exc:
                result = exc.code
        with lock:
            outcomes.append(result)

    threads = [threading.Thread(target=worker) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    try:
        assert outcomes.count("ok") == 5
        assert outcomes.count("ai_quota_exceeded") == 15
    finally:
        with Session() as db:
            db.query(User).filter_by(email=email).delete()
            db.commit()


def test_categorize_without_ai_consent_never_sends_the_description_to_the_llm(test_client, db_session, limits):
    with patch.object(CategorizationService, "llm_classify", return_value=("Food & Drink", "Dining out", "Subway")) as mock_llm:
        res = test_client.post("/api/v1/expenses/categorize", json={"description": "zqx vendor 42", "allow_ai": False})
    assert res.status_code == 200
    assert res.json()["main_category"] == "Other"
    mock_llm.assert_not_called()
