"""tests/test_chat_tag_tool.py — TS-TAG-113 get_tag_summary chat tool.

Covers `_format_tag_summary`/`_resolve_tag_by_name` directly (same pattern as
test_chat_card_coach_tool.py) — no LangGraph agent/real LLM involved — plus an end-to-end check
that AnalysisService.analyze() feeds the formatter correctly.
"""
import os
import uuid
from datetime import datetime

import pytest

from varavu_selavu_service.db.models import Expense, User
from varavu_selavu_service.services.analysis_service import AnalysisService
from varavu_selavu_service.services.chat_service import _format_tag_summary, _resolve_tag_by_name
from varavu_selavu_service.services.tag_service import TagService


@pytest.fixture(autouse=True)
def _tags_enabled():
    old_val = os.environ.get("TAGS_ENABLED")
    os.environ["TAGS_ENABLED"] = "true"
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["TAGS_ENABLED"] = old_val
        else:
            os.environ.pop("TAGS_ENABLED", None)


# ─── _format_tag_summary ────────────────────────────────


def test_format_no_expenses_found():
    result = {"my_expenses_total": 0.0, "i_paid_total": 0.0}
    out = _format_tag_summary("Trip 1", result, group_share_included=False)
    assert "No expenses found tagged 'Trip 1'" in out


def test_format_none_total_treated_as_not_found():
    result = {"my_expenses_total": None, "i_paid_total": None}
    out = _format_tag_summary("Trip 1", result, group_share_included=False)
    assert "No expenses found" in out


def test_format_personal_only_omits_i_paid_when_equal():
    result = {"my_expenses_total": 120.0, "i_paid_total": 120.0}
    out = _format_tag_summary("Trip 1", result, group_share_included=True)
    assert "$120.00" in out
    assert "My Expenses" in out
    assert "I Paid" not in out


def test_format_includes_i_paid_when_it_differs():
    result = {"my_expenses_total": 55.0, "i_paid_total": 100.0}
    out = _format_tag_summary("Trip 1", result, group_share_included=True)
    assert "$55.00" in out
    assert "$100.00" in out
    assert "I Paid" in out


def test_format_omits_i_paid_when_group_share_not_included():
    result = {"my_expenses_total": 55.0, "i_paid_total": 100.0}
    out = _format_tag_summary("Trip 1", result, group_share_included=False)
    assert "I Paid" not in out


# ─── _resolve_tag_by_name ────────────────────────────────


def test_resolve_exact_match(db_session):
    svc = TagService(db_session)
    tag, _ = svc.create_tag("test@user.com", "Trip 1")
    found = _resolve_tag_by_name(svc, "test@user.com", "Trip 1")
    assert found.id == tag.id


def test_resolve_case_and_whitespace_insensitive(db_session):
    svc = TagService(db_session)
    tag, _ = svc.create_tag("test@user.com", "Trip 1")
    found = _resolve_tag_by_name(svc, "test@user.com", "  TRIP   1  ")
    assert found.id == tag.id


def test_resolve_forgiving_substring_match(db_session):
    svc = TagService(db_session)
    tag, _ = svc.create_tag("test@user.com", "Trip 1")
    found = _resolve_tag_by_name(svc, "test@user.com", "trip")
    assert found.id == tag.id


def test_resolve_returns_none_for_no_match(db_session):
    svc = TagService(db_session)
    svc.create_tag("test@user.com", "Trip 1")
    assert _resolve_tag_by_name(svc, "test@user.com", "Nonexistent") is None


def test_resolve_never_matches_another_users_tag(db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()
    svc = TagService(db_session)
    svc.create_tag("other@user.com", "Trip 1")
    assert _resolve_tag_by_name(svc, "test@user.com", "Trip 1") is None


# ─── End-to-end: AnalysisService feeds the formatter correctly ────────────────────────────────


def test_end_to_end_tag_summary_personal_only(test_client, db_session):
    tag_svc = TagService(db_session)
    tag, _ = tag_svc.create_tag("test@user.com", "Trip 1")
    exp = Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Shopping", amount=40.0, description="Souvenir")
    db_session.add(exp)
    db_session.commit()
    tag_svc.apply_tags_to_expense("test@user.com", str(exp.id), tag_ids=[str(tag.id)])

    analysis_service = AnalysisService(db_session)
    resolved = _resolve_tag_by_name(tag_svc, "test@user.com", "Trip 1")
    result = analysis_service.analyze(user_id="test@user.com", start_date="2026-01-01", end_date="2026-01-31", use_cache=False, tag_ids=[str(resolved.id)])

    out = _format_tag_summary(resolved.name, result, group_share_included=False)
    assert "$40.00" in out
    assert "Trip 1" in out
