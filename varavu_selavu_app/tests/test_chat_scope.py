"""Topic gate: the AI chat answers only expense / personal-finance / TrackSpense questions."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from varavu_selavu_service.db.models import AiUsageDaily
from varavu_selavu_service.services import ai_quota_service, chat_service
from varavu_selavu_service.services.ai_quota_service import utc_today
from varavu_selavu_service.services.chat_service import (
    OFF_TOPIC_REPLY,
    _classify_scope,
    _scope_fast_path,
)


@pytest.mark.parametrize("q", [
    "How much did I spend on groceries last month?",
    "who owes me money in Roommates",
    "set a budget for dining out",
    "is there a porkbun subscription",
    "log $12 lunch at Chipotle",
    "which credit card gives the most rewards",
])
def test_fast_path_lets_obvious_finance_questions_through(q):
    assert _scope_fast_path(q)


@pytest.mark.parametrize("q", [
    "write a poem about cats",
    "explain quantum computing",
    "fix this python function for me",
    "who won the world cup in 2022",
    "coffee 6.75 at Blue Bottle",  # in scope, but terse: decided by the classifier, not the fast path
])
def test_fast_path_does_not_decide_everything(q):
    assert not _scope_fast_path(q)


def _llm(reply, input_tokens=120, output_tokens=1):
    llm = MagicMock()
    llm.invoke.return_value = SimpleNamespace(
        content=reply, usage_metadata={"input_tokens": input_tokens, "output_tokens": output_tokens}
    )
    return llm


def test_classifier_out_is_refused_and_reports_tokens():
    assert _classify_scope(_llm("OUT"), "write a poem", None) == (False, 120, 1)


def test_classifier_in_and_gemini_list_content():
    assert _classify_scope(_llm([{"type": "text", "text": "IN"}]), "coffee 6.75", None)[0] is True


def test_classifier_fails_open():
    llm = MagicMock()
    llm.invoke.side_effect = RuntimeError("provider down")
    assert _classify_scope(llm, "anything", None) == (True, 0, 0)


def test_classifier_sees_previous_reply_for_follow_ups():
    llm = _llm("IN")
    _classify_scope(llm, "and last month?", "You spent $420 on dining out in September.")
    sent = llm.invoke.call_args.args[0][1][1]
    assert "You spent $420" in sent and "and last month?" in sent


def _run_chat(monkeypatch, question, classifier_reply, enforce_scope=True):
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    fake_llm = _llm(classifier_reply)
    monkeypatch.setattr(chat_service, "ChatGoogleGenerativeAI", MagicMock(return_value=fake_llm))
    agent = MagicMock()
    agent.stream.return_value = iter([])
    build = MagicMock(return_value=agent)
    monkeypatch.setattr(chat_service, "create_react_agent", build)
    svc = MagicMock()
    svc.analyze.return_value = {}
    try:
        result = chat_service.call_chat_model(
            messages=[{"role": "user", "content": question}],
            user_id="test@user.com", analysis_service=svc, analytics_service=MagicMock(),
            insight_service=MagicMock(), expense_service=MagicMock(), enforce_scope=enforce_scope,
        )
    except Exception:
        result = None  # the fake agent yields nothing; only reaching it matters for in-scope cases
    return result, build


def test_off_topic_question_never_reaches_the_agent(monkeypatch):
    result, build = _run_chat(monkeypatch, "write a poem about cats", "OUT")
    assert result.off_topic is True and result.response == OFF_TOPIC_REPLY
    assert (result.input_tokens, result.output_tokens) == (120, 1)
    build.assert_not_called()


def test_in_scope_question_reaches_the_agent(monkeypatch):
    _, build = _run_chat(monkeypatch, "coffee 6.75 at Blue Bottle", "IN")
    build.assert_called_once()


def test_server_built_prompts_skip_the_gate(monkeypatch):
    _, build = _run_chat(monkeypatch, "write a poem about cats", "OUT", enforce_scope=False)
    build.assert_called_once()


@pytest.fixture(autouse=True)
def _reset_spend_cache():
    ai_quota_service.reset_spend_cache()
    yield
    ai_quota_service.reset_spend_cache()


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_refused_question_is_free_but_its_classifier_cost_is_recorded(mock_chat, test_client, db_session, monkeypatch):
    from varavu_selavu_service.models.api_models import ResolvedPeriod, ResolvedScope
    from varavu_selavu_service.services.chat_service import ChatResult

    monkeypatch.setenv("AI_CHAT_DAILY_LIMIT", "2")
    mock_chat.return_value = ChatResult(
        response=OFF_TOPIC_REPLY,
        resolved_period=ResolvedPeriod(start_date="2026-10-01", end_date="2026-10-31", label="October 2026", source="default"),
        resolved_scope=ResolvedScope(kind="personal"),
        model_name="gemini-3.1-flash-lite", input_tokens=150, output_tokens=1, llm_called=True, off_topic=True,
    )
    for _ in range(3):  # more than the daily limit: refusals never use it up
        res = test_client.post("/api/v1/analysis/chat", json={"messages": [{"role": "user", "content": "write a poem"}]})
        assert res.status_code == 200 and res.json()["response"] == OFF_TOPIC_REPLY
    db_session.expire_all()
    row = db_session.query(AiUsageDaily).filter_by(user_email="test@user.com", feature="chat", day=utc_today()).one()
    assert row.count == 0
    assert row.input_tokens == 450 and float(row.est_cost_usd) > 0


# Every question the apps pre-fill for the user (starter chips, "Ask AI" links, "Ask why") must
# reach the agent without depending on the LLM classifier. Keep in sync with SUGGESTED_PROMPTS in
# varavu_selavu_ui/src/components/ai-analyst/AIAnalystChat.tsx and
# varavu_selavu_mobile/src/screens/AIAnalystScreen.tsx, and the askAi/initialQuery templates.
@pytest.mark.parametrize("q", [
    "What were my top spending categories?",
    "How much did I spend at Amazon?",
    "Has the price of milk gone up?",
    "Where did I buy eggs cheapest?",
    "Has the price of Organic Milk gone up? Where is it cheapest?",
    "How much have I spent at Costco, and is it going up?",
    "Tell me about my spending on Eggs (dozen) — price trends and where I buy it cheapest.",
    "Tell me about my spending at Costco — trends and how it compares to my other merchants.",
    "Which card should I use for a purchase?",
    "How much would I have earned this month with a different card, by category?",
    "Why is my Dining out spend up this period?",
])
def test_app_prefilled_prompts_pass_the_fast_path(q):
    assert _scope_fast_path(q)


@pytest.mark.parametrize("q", [
    "what stock should I buy this week",
    "what's the price of bitcoin",
    "write a birthday card for my mom",
])
def test_widened_fast_path_still_leaves_lookalikes_to_the_classifier(q):
    assert not _scope_fast_path(q)
