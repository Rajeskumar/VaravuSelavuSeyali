"""
TS-ANL-013 — Chat agent time period and scope resolution.

Covers the deterministic natural-language period parser, the personal/group
scope resolver, and the group-balance tool helper — all pure/service-level
functions that don't require invoking a real LLM. `_resolve_chat_period`'s
precedence (query phrase > explicit param > current-month default) is
exercised directly; `test_analytics_api.py`'s existing chat-route tests cover
the HTTP-layer plumbing of the new `resolved_period`/`resolved_scope` fields.
"""
import os
from datetime import date

import pytest

from varavu_selavu_service.services.chat_service import (
    _parse_period_from_text,
    _resolve_chat_period,
    _resolve_scope_from_text,
    _fetch_group_balance_summary,
)
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.balance_service import BalanceService
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.main import app


# --------------------------------------------------------------------------- #
# _parse_period_from_text — deterministic phrase parsing
# --------------------------------------------------------------------------- #

# Fixed "today" mid-year, so month/quarter/year math has real boundaries to cross.
_TODAY = date(2026, 7, 15)
# A second fixed "today" in January, so "last month"/"last quarter" cross a year
# boundary — the kind of edge case a single mid-year fixture would never catch.
_TODAY_JAN = date(2026, 1, 20)


@pytest.mark.parametrize(
    "query,expected",
    [
        ("How much did I spend last month?", ("2026-06-01", "2026-06-30", "June 2026")),
        ("What about this month?", ("2026-07-01", "2026-07-31", "July 2026")),
        ("Show me this year", ("2026-01-01", "2026-07-15", "2026")),
        ("last year totals please", ("2025-01-01", "2025-12-31", "2025")),
        ("last quarter spending", ("2026-04-01", "2026-06-30", "Q2 2026")),
        ("past 3 months please", ("2026-04-15", "2026-07-15", "the last 3 months")),
        ("since March how much", ("2026-03-01", "2026-07-15", "since March 2026")),
        ("in May how much did I spend", ("2026-05-01", "2026-05-31", "May 2026")),
        # "December" hasn't happened yet this year relative to July — should roll back to last year.
        ("in December how much did I spend", ("2025-12-01", "2025-12-31", "December 2025")),
    ],
)
def test_parse_period_from_text_recognized_phrases(query, expected):
    assert _parse_period_from_text(query, _TODAY) == expected


def test_parse_period_from_text_no_recognizable_phrase_returns_none():
    assert _parse_period_from_text("what did I spend on eggs", _TODAY) is None
    assert _parse_period_from_text("how much do I owe Priya", _TODAY) is None


def test_parse_period_from_text_last_month_crosses_year_boundary():
    # "today" is January 2026 — last month must resolve to December 2025, not month 0.
    assert _parse_period_from_text("what did I spend last month", _TODAY_JAN) == (
        "2025-12-01", "2025-12-31", "December 2025",
    )


def test_parse_period_from_text_last_quarter_crosses_year_boundary():
    # January 2026 is in Q1 2026 — last quarter is Q4 2025 (Oct-Dec).
    assert _parse_period_from_text("last quarter numbers", _TODAY_JAN) == (
        "2025-10-01", "2025-12-31", "Q4 2025",
    )


# --------------------------------------------------------------------------- #
# _resolve_chat_period — full precedence: phrase > explicit param > default
# --------------------------------------------------------------------------- #

def test_resolve_chat_period_phrase_wins_when_present():
    # _resolve_chat_period has no injectable "today" (deliberately — it always
    # uses real wall-clock time, same as the pre-existing function it replaces),
    # so this asserts against a value computed the same way the function itself
    # computes it, rather than a hardcoded date string that would only be true
    # some months of the year.
    from dateutil.relativedelta import relativedelta
    today = date.today()
    expected_start = (today.replace(day=1) - relativedelta(months=1))
    expected_end = today.replace(day=1) - relativedelta(days=1)

    result = _resolve_chat_period("what did I spend last month", None, None, None, None)
    assert result.source == "parsed_from_query"
    assert result.start_date == expected_start.isoformat()
    assert result.end_date == expected_end.isoformat()
    assert result.label == expected_start.strftime("%B %Y")

    # Also confirm it still wins over an explicit param sent alongside the phrase.
    result_with_param = _resolve_chat_period("what did I spend last month", 1999, 1, None, None)
    assert result_with_param.source == "parsed_from_query"
    assert result_with_param.start_date == expected_start.isoformat()


def test_resolve_chat_period_explicit_param_wins_when_no_phrase():
    # Regression check: the existing "Ask AI about this item" deep-link sends an
    # explicit year/month with a query that names no period phrase — must still
    # resolve to exactly that month, unchanged by this ticket's new parsing.
    result = _resolve_chat_period("Tell me about my spending on Eggs", 2023, 5, None, None)
    assert result.source == "explicit_param"
    assert result.start_date == "2023-05-01"
    assert result.end_date == "2023-05-31"
    assert result.label == "May 2023"


def test_resolve_chat_period_explicit_start_end_date_wins_when_no_phrase():
    result = _resolve_chat_period("how are things looking", None, None, "2024-01-01", "2024-03-31")
    assert result.source == "explicit_param"
    assert result.start_date == "2024-01-01"
    assert result.end_date == "2024-03-31"


def test_resolve_chat_period_defaults_to_current_month_not_last_3_months():
    # TS-ANL-013's deliberate behavior change: no phrase + no explicit params
    # used to default to a rolling last-3-months window; it must now default
    # to the current calendar month, matching Dashboard/Analysis/Insights.
    result = _resolve_chat_period("what's my spending like", None, None, None, None)
    assert result.source == "default"
    today = date.today()
    assert result.start_date == today.replace(day=1).isoformat()
    assert result.label == today.strftime("%B %Y")


# --------------------------------------------------------------------------- #
# _resolve_scope_from_text
# --------------------------------------------------------------------------- #

_GROUPS = [
    {"name": "Weekend Trip", "group_id": "g1"},
    {"name": "Roommates", "group_id": "g2"},
]


def test_resolve_scope_from_text_matches_named_group():
    scope = _resolve_scope_from_text("How much do I owe in Weekend Trip?", _GROUPS)
    assert scope.kind == "group"
    assert scope.group_id == "g1"
    assert scope.group_name == "Weekend Trip"


def test_resolve_scope_from_text_defaults_to_personal_for_generic_language():
    # Deliberately conservative: generic "I owe"/"split" language that doesn't
    # name a specific group must NOT guess a group — stays personal.
    scope = _resolve_scope_from_text("How much do I owe overall?", _GROUPS)
    assert scope.kind == "personal"
    assert scope.group_id is None


def test_resolve_scope_from_text_no_match_with_empty_groups():
    scope = _resolve_scope_from_text("How much do I owe in Weekend Trip?", [])
    assert scope.kind == "personal"


def test_resolve_scope_from_text_ordinary_spending_question_is_personal():
    scope = _resolve_scope_from_text("How much did I spend on groceries?", _GROUPS)
    assert scope.kind == "personal"


# --------------------------------------------------------------------------- #
# Integration: real GroupService/BalanceService + the multi-tenant guard
# --------------------------------------------------------------------------- #

def _as_user(email: str):
    old = app.dependency_overrides.get(auth_required)
    app.dependency_overrides[auth_required] = lambda: email
    return old


def _restore(old):
    if old is not None:
        app.dependency_overrides[auth_required] = old
    else:
        app.dependency_overrides.pop(auth_required, None)


@pytest.fixture(autouse=True)
def _groups_enabled():
    old_val = os.environ.get("GROUPS_ENABLED")
    os.environ["GROUPS_ENABLED"] = "true"
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["GROUPS_ENABLED"] = old_val
        else:
            os.environ.pop("GROUPS_ENABLED", None)


def test_group_scope_resolution_and_balance_summary_end_to_end(test_client, db_session):
    # Seed: "test@user.com" (the default auth-overridden user) creates a real group.
    create_res = test_client.post(
        "/api/v1/groups", json={"name": "Weekend Trip", "group_type": "trip"}
    )
    assert create_res.status_code == 201
    group_id = create_res.json()["group_id"]

    group_service = GroupService(db_session)
    balance_service = BalanceService(db_session)

    user_groups = group_service.list_groups_for_user("test@user.com")
    assert any(g["name"] == "Weekend Trip" for g in user_groups)

    scope = _resolve_scope_from_text("How much do I owe in Weekend Trip?", user_groups)
    assert scope.kind == "group"
    assert scope.group_name == "Weekend Trip"

    summary = _fetch_group_balance_summary("Weekend Trip", user_groups, balance_service, "test@user.com")
    assert "No group found" not in summary
    # A brand-new group with only its creator has one member and a zero net —
    # the point here is that the real balance data was fetched at all, not
    # that it's non-zero (settlement/split math is covered by test_balances.py).
    assert "members" in summary or "net" in summary


def test_group_scope_resolution_never_leaks_another_users_group(test_client, db_session):
    # "test@user.com" creates a group named "Secret Trip" that another user
    # ("other@user.com") is not a member of.
    create_res = test_client.post(
        "/api/v1/groups", json={"name": "Secret Trip", "group_type": "trip"}
    )
    assert create_res.status_code == 201

    from varavu_selavu_service.db.models import User
    import uuid
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()

    group_service = GroupService(db_session)
    other_users_groups = group_service.list_groups_for_user("other@user.com")
    assert not any(g["name"] == "Secret Trip" for g in other_users_groups)

    # Resolving "other@user.com"'s own (empty, w.r.t. this group) group list
    # against a query naming the other user's group must not match it.
    scope = _resolve_scope_from_text("How much do I owe in Secret Trip?", other_users_groups)
    assert scope.kind == "personal"
