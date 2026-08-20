"""tests/test_chat_card_coach_tool.py — TS-CARD-109 get_card_coach_summary chat tool.

Covers `_format_card_coach_summary` directly (same pattern as
test_chat_create_expense_tools.py's extracted-helper tests) — no LangGraph agent/real LLM
involved — plus an end-to-end check that CardService.compute_coach_gaps feeds it correctly.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest

from varavu_selavu_service.db.models import CardCatalog, CardEarningRule, Expense
from varavu_selavu_service.services.card_rewards_engine import (
    ALL_PURCHASES,
    CardRewardEstimate,
    CategoryRewardGap,
)
from varavu_selavu_service.services.card_service import CardService
from varavu_selavu_service.services.chat_service import _format_card_coach_summary


def test_format_no_spend_rows():
    assert _format_card_coach_summary([], group_share_included=False) == "No categorized spend found for this period."


def test_format_skips_zero_spend_categories():
    gap = CategoryRewardGap(category="Empty", actual_spend=0.0)
    assert _format_card_coach_summary([gap], group_share_included=False) == "No categorized spend found for this period."


def test_format_no_default_card_says_unknown():
    gap = CategoryRewardGap(
        category="Groceries",
        actual_spend=100.0,
        actual=None,
        optimal_in_wallet=CardRewardEstimate(
            card_id="c1", card_name="Blue Cash Preferred", reward_type="cashback",
            matched_category_id="Groceries", multiplier=6.0, earned_raw=6.0, earned_usd=6.0,
        ),
    )
    out = _format_card_coach_summary([gap], group_share_included=False)
    assert "no default card set" in out
    assert "Blue Cash Preferred" in out


def test_format_includes_group_share_note():
    gap = CategoryRewardGap(category="Food & Drink", actual_spend=90.0)
    out = _format_card_coach_summary([gap], group_share_included=True)
    assert "full amount paid on group expenses" in out


def test_format_total_gap_matches_sum():
    gap1 = CategoryRewardGap(
        category="Groceries", actual_spend=100.0,
        actual=CardRewardEstimate(card_id="c2", card_name="Freedom Unlimited", reward_type="cashback", matched_category_id=ALL_PURCHASES, multiplier=1.5, earned_raw=1.5, earned_usd=1.5),
        optimal_in_wallet=CardRewardEstimate(card_id="c1", card_name="Blue Cash Preferred", reward_type="cashback", matched_category_id="Groceries", multiplier=6.0, earned_raw=6.0, earned_usd=6.0),
    )
    out = _format_card_coach_summary([gap1], group_share_included=False)
    assert "$4.50" in out  # 6.00 - 1.50
    assert "Estimated total reward gap this period: $4.50" in out


@pytest.fixture(autouse=True)
def _card_coach_enabled():
    old_val = os.environ.get("CARD_COACH_ENABLED")
    os.environ["CARD_COACH_ENABLED"] = "true"
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["CARD_COACH_ENABLED"] = old_val
        else:
            os.environ.pop("CARD_COACH_ENABLED", None)


def test_compute_coach_gaps_feeds_formatter_end_to_end(db_session):
    """CardService.compute_coach_gaps (the same method the /cards/coach route and the chat tool
    both call) produces output _format_card_coach_summary can render without error."""
    card = CardCatalog(
        id=uuid.uuid4(), issuer="Amex", card_name="Blue Cash Preferred", reward_type="cashback",
        annual_fee=0, source_url="https://example.com", last_verified_at=datetime(2026, 7, 1, tzinfo=timezone.utc), is_active=True,
    )
    db_session.add(card)
    db_session.commit()
    db_session.add(CardEarningRule(id=uuid.uuid4(), card_id=card.id, category_id="Groceries", multiplier=6.0))
    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Groceries", amount=100.0, description="Weekly shop"))
    db_session.commit()

    svc = CardService(db_session)
    gaps, group_share_included = svc.compute_coach_gaps("test@user.com", year=2026, month=1, groups_enabled=False)

    out = _format_card_coach_summary(gaps, group_share_included)
    assert "Groceries" in out
    assert "Blue Cash Preferred" in out
    assert group_share_included is False
