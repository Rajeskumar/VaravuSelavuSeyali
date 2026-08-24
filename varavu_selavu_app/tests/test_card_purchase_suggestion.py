"""tests/test_card_purchase_suggestion.py — Phase 2 prospective "which card should I use for
this purchase" feature: CardService.suggest_best_card_for_purchase + the
suggest_best_card_for_purchase chat tool's formatter. Deliberately only ever recommends among the
user's HELD cards (never the catalog) — see the docstring on
CardService.suggest_best_card_for_purchase for why.

Also covers the post-review fixes: case-insensitive category matching (a fresh-eyes review found
`_best_rule` compared category_id with a strict `==` while merchant matching was already
case-insensitive — this tool is the first caller to feed it an LLM-generated guess rather than
validated stored data), an honest message for points/miles cards with no dollar-comparable
estimate (previously misreported as "no bonus rate"), rejecting non-positive amounts, and a
"vs. your default card" comparison.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest

from varavu_selavu_service.db.models import CardCatalog, CardEarningRule
from varavu_selavu_service.services.card_rewards_engine import CardRewardEstimate
from varavu_selavu_service.services.card_service import CardService, CardSuggestion
from varavu_selavu_service.services.chat_service import _format_card_suggestion


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


def _seed_card(db_session, issuer, card_name, reward_type="cashback", point_value=None, rules=None) -> CardCatalog:
    card = CardCatalog(
        id=uuid.uuid4(), issuer=issuer, card_name=card_name, reward_type=reward_type,
        point_value_estimate_usd=point_value, annual_fee=0, source_url="https://example.com",
        last_verified_at=datetime(2026, 7, 1, tzinfo=timezone.utc), is_active=True,
    )
    db_session.add(card)
    db_session.commit()
    for rule in rules or []:
        db_session.add(CardEarningRule(id=uuid.uuid4(), card_id=card.id, **rule))
    db_session.commit()
    return card


# ─── CardService.suggest_best_card_for_purchase ────────────────────────────────


def test_no_held_cards_returns_none_and_zero_count(db_session):
    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Groceries")
    assert result.estimate is None
    assert result.held_card_count == 0


def test_merchant_rule_wins_over_category_rule(test_client, db_session):
    card = _seed_card(db_session, "Apple", "Apple Card", rules=[
        {"category_id": "All Purchases", "multiplier": 1.0},
        {"category_id": None, "merchant_name": "Apple", "multiplier": 3.0},
    ])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Electronics", merchant="Apple")
    assert result.held_card_count == 1
    assert result.estimate.card_name == "Apple Card"
    assert result.estimate.multiplier == 3.0


def test_category_only_match_when_no_merchant_given(test_client, db_session):
    card = _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[
        {"category_id": "Groceries", "multiplier": 6.0},
    ])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Groceries")
    assert result.held_card_count == 1
    assert result.estimate.card_name == "Blue Cash Preferred"
    assert result.estimate.multiplier == 6.0


def test_category_matching_is_case_insensitive(test_client, db_session):
    """A fresh-eyes review found this gap: the LLM decides the category argument from free text,
    so it may not always match the stored rule's exact case, unlike merchant matching which was
    already defensive here."""
    card = _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[
        {"category_id": "Groceries", "multiplier": 6.0},
    ])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "groceries")  # lowercase
    assert result.estimate is not None
    assert result.estimate.multiplier == 6.0


def test_picks_best_among_multiple_held_cards(test_client, db_session):
    flat_card = _seed_card(db_session, "Chase", "Freedom Unlimited", rules=[{"category_id": "All Purchases", "multiplier": 1.5}])
    grocery_card = _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[{"category_id": "Groceries", "multiplier": 6.0}])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(flat_card.id)})
    test_client.post("/api/v1/cards/mine", json={"card_id": str(grocery_card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Groceries")
    assert result.held_card_count == 2
    assert result.estimate.card_name == "Blue Cash Preferred"


def test_never_recommends_a_catalog_card_the_user_doesnt_hold(test_client, db_session):
    """The one card in the catalog with the best rate is never held — must return None, not
    silently recommend a card the user doesn't own."""
    held_card = _seed_card(db_session, "Chase", "Freedom Unlimited", rules=[{"category_id": "All Purchases", "multiplier": 1.5}])
    _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[{"category_id": "Groceries", "multiplier": 6.0}])  # not held
    test_client.post("/api/v1/cards/mine", json={"card_id": str(held_card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Groceries")
    assert result.held_card_count == 1
    assert result.estimate.card_name == "Freedom Unlimited"  # falls back to the held flat-rate card


def test_returns_none_when_held_card_has_no_applicable_rule(test_client, db_session):
    card = _seed_card(db_session, "Store", "No-Rules Card", rules=[])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Groceries")
    assert result.held_card_count == 1
    assert result.estimate is None
    assert result.unpriced is None


def test_amount_sizes_the_dollar_estimate_without_changing_ranking(test_client, db_session):
    card = _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[{"category_id": "Groceries", "multiplier": 6.0}])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Groceries", amount=200.0)
    assert result.estimate.earned_usd == 12.0  # 6% of $200


def test_negative_amount_is_treated_as_not_given(test_client, db_session):
    card = _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[{"category_id": "Groceries", "multiplier": 6.0}])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Groceries", amount=-50.0)
    assert result.amount is None
    assert result.estimate.earned_usd == 6.0  # nominal $100 basis, never a negative estimate


def test_unpriced_points_card_surfaced_separately_from_no_match(test_client, db_session):
    """A held points/miles card WITH an applicable rule but no stored point_value_estimate_usd
    must not be indistinguishable from 'no card has a bonus rate at all' (the exact bug a
    fresh-eyes review found)."""
    card = _seed_card(db_session, "Chase", "Sapphire Preferred", reward_type="points", point_value=None, rules=[
        {"category_id": "Dining out", "multiplier": 3.0},
    ])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Dining out")
    assert result.estimate is None  # not dollar-comparable, correctly excluded from ranking
    assert result.unpriced is not None
    assert result.unpriced.card_name == "Sapphire Preferred"
    assert result.unpriced.multiplier == 3.0


def test_default_estimate_populated_for_comparison(test_client, db_session):
    flat_card = _seed_card(db_session, "Chase", "Freedom Unlimited", rules=[{"category_id": "All Purchases", "multiplier": 1.5}])
    grocery_card = _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[{"category_id": "Groceries", "multiplier": 6.0}])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(flat_card.id)})  # becomes default (first added)
    test_client.post("/api/v1/cards/mine", json={"card_id": str(grocery_card.id)})

    svc = CardService(db_session)
    result = svc.suggest_best_card_for_purchase("test@user.com", "Groceries")
    assert result.estimate.card_name == "Blue Cash Preferred"
    assert result.default_estimate is not None
    assert result.default_estimate.card_name == "Freedom Unlimited"
    assert result.default_estimate.multiplier == 1.5


# ─── _format_card_suggestion ────────────────────────────────────────────────


def test_format_no_held_cards():
    out = _format_card_suggestion(CardSuggestion(None, None, 0, None, None), "Groceries", None)
    assert "haven't added any cards" in out


def test_format_no_applicable_rule():
    out = _format_card_suggestion(CardSuggestion(None, None, 1, None, None), "Groceries", None)
    assert "None of your held cards has a bonus rate" in out
    assert "Groceries" in out


def test_format_unpriced_points_card_is_honest_not_a_no_match_message():
    unpriced = CardRewardEstimate(card_id="c1", card_name="Sapphire Preferred", reward_type="points", multiplier=3.0, earned_raw=300.0, earned_usd=None)
    out = _format_card_suggestion(CardSuggestion(None, unpriced, 1, 100.0, None), "Dining out", None)
    assert "None of your held cards has a bonus rate" not in out
    assert "Sapphire Preferred" in out
    assert "3x" in out
    assert "300 points" in out
    assert "don't have a stored dollar value" in out


def test_format_cashback_card_with_category():
    est = CardRewardEstimate(card_id="c1", card_name="Blue Cash Preferred", reward_type="cashback", multiplier=6.0, earned_raw=6.0, earned_usd=6.0)
    out = _format_card_suggestion(CardSuggestion(est, None, 1, None, None), "Groceries", None)
    assert "Blue Cash Preferred" in out
    assert "on Groceries" in out
    assert "6%" in out


def test_format_merchant_scope_and_dollar_amount():
    est = CardRewardEstimate(card_id="c1", card_name="Apple Card", reward_type="cashback", matched_merchant_name="Apple", multiplier=3.0, earned_raw=6.0, earned_usd=6.0)
    out = _format_card_suggestion(CardSuggestion(est, None, 1, 200.0, None), "Electronics", "Apple")
    assert "at Apple" in out
    assert "3%" in out
    assert "$6.00" in out
    assert "$200.00" in out


def test_format_points_card_shows_x_not_percent_and_raw_points():
    est = CardRewardEstimate(card_id="c1", card_name="Sapphire Preferred", reward_type="points", multiplier=3.0, earned_raw=300.0, earned_usd=3.75)
    out = _format_card_suggestion(CardSuggestion(est, None, 1, 100.0, None), "Plane", None)
    assert "3x" in out
    assert "300 points" in out
    assert "%" not in out.split("—")[1].split(",")[0]  # the rate clause itself has no "%"


def test_format_includes_cap_note():
    est = CardRewardEstimate(
        card_id="c1", card_name="Blue Cash Preferred", reward_type="cashback", multiplier=6.0,
        earned_raw=6.0, earned_usd=6.0, cap_note="applies up to $6,000/year",
    )
    out = _format_card_suggestion(CardSuggestion(est, None, 1, None, None), "Groceries", None)
    assert "applies up to $6,000/year" in out


def test_format_includes_dollar_delta_vs_default_when_amount_given():
    est = CardRewardEstimate(card_id="c2", card_name="Blue Cash Preferred", reward_type="cashback", multiplier=6.0, earned_raw=12.0, earned_usd=12.0)
    default_est = CardRewardEstimate(card_id="c1", card_name="Freedom Unlimited", reward_type="cashback", multiplier=1.5, earned_raw=3.0, earned_usd=3.0)
    out = _format_card_suggestion(CardSuggestion(est, None, 2, 200.0, default_est), "Groceries", None)
    assert "$9.00 more than your default Freedom Unlimited" in out


def test_format_includes_rate_only_delta_vs_default_when_no_amount_given():
    est = CardRewardEstimate(card_id="c2", card_name="Blue Cash Preferred", reward_type="cashback", multiplier=6.0, earned_raw=6.0, earned_usd=6.0)
    default_est = CardRewardEstimate(card_id="c1", card_name="Freedom Unlimited", reward_type="cashback", multiplier=1.5, earned_raw=1.5, earned_usd=1.5)
    out = _format_card_suggestion(CardSuggestion(est, None, 2, None, default_est), "Groceries", None)
    assert "your default Freedom Unlimited only earns 1.5%" in out
    assert "$" not in out.split("(")[1]  # no fabricated dollar figure without a real amount


def test_format_omits_vs_default_when_recommended_card_is_already_the_default():
    est = CardRewardEstimate(card_id="c1", card_name="Freedom Unlimited", reward_type="cashback", multiplier=1.5, earned_raw=1.5, earned_usd=1.5)
    out = _format_card_suggestion(CardSuggestion(est, None, 1, None, est), "Groceries", None)
    assert "your default" not in out


def test_format_omits_vs_default_when_units_differ_and_not_comparable():
    """Default card's rule isn't dollar-priced (points, no point value) — must never be compared
    against a dollar-priced recommendation by raw multiplier (different units)."""
    est = CardRewardEstimate(card_id="c2", card_name="Blue Cash Preferred", reward_type="cashback", multiplier=6.0, earned_raw=6.0, earned_usd=6.0)
    default_est = CardRewardEstimate(card_id="c1", card_name="Sapphire Preferred", reward_type="points", multiplier=3.0, earned_raw=300.0, earned_usd=None)
    out = _format_card_suggestion(CardSuggestion(est, None, 2, None, default_est), "Groceries", None)
    assert "your default" not in out
