"""tests/test_card_coach_api.py — TS-CARD-105/106 GET /cards/coach."""
import os
import uuid
from datetime import datetime, timezone

import pytest

from varavu_selavu_service.db.models import CardCatalog, CardEarningRule, Expense, Group, GroupMember, User
from varavu_selavu_service.services.analysis_service import AnalysisService


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


def _seed_card(db_session, issuer, card_name, reward_type="cashback", rules=None) -> CardCatalog:
    card = CardCatalog(
        id=uuid.uuid4(),
        issuer=issuer,
        card_name=card_name,
        reward_type=reward_type,
        annual_fee=0,
        source_url="https://example.com",
        last_verified_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(card)
    db_session.commit()
    for rule in rules or []:
        db_session.add(CardEarningRule(id=uuid.uuid4(), card_id=card.id, **rule))
    db_session.commit()
    return card


def _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=1):
    """test@user.com has a $50 personal expense (Shopping) and authors a $90 group expense
    (Food & Drink) split equally with b@test.com (my_share=$45, i_paid=$90)."""
    db_session.add(Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        purchased_at=datetime(year, month, 5),
        category_id="Shopping",
        amount=50.00,
        description="Solo purchase",
    ))
    db_session.commit()

    db_session.add(User(id=uuid.uuid4(), email="b@test.com", password_hash="hash", name="B"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    admin_member = db_session.query(GroupMember).filter(
        GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com"
    ).first()
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "b@test.com"})
    member_ids = {"test@user.com": str(admin_member.id), "b@test.com": member_res.json()["member_id"]}

    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": f"{month:02d}/05/{year}",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": member_ids["test@user.com"], "amount_paid": 90.00}],
            "split": {
                "type": "equal",
                "entries": [{"member_id": member_ids["test@user.com"]}, {"member_id": member_ids["b@test.com"]}],
            },
        },
    )
    AnalysisService(db_session).invalidate_cache()
    return group_id, member_ids


def test_gate_returns_404_when_disabled(test_client, monkeypatch):
    monkeypatch.setenv("CARD_COACH_ENABLED", "false")
    res = test_client.get("/api/v1/cards/coach")
    assert res.status_code == 404


def test_empty_state_no_held_cards(test_client, db_session):
    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Shopping", amount=50.00, description="Solo"))
    db_session.commit()

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 1})
    assert res.status_code == 200
    body = res.json()
    row = next(c for c in body["by_category"] if c["category"] == "Shopping")
    assert row["actual_spend"] == 50.00
    assert row["actual_earned_estimate"] is None
    assert row["held_card_used"] is None
    assert row["optimal_in_wallet_card"] is None
    assert body["total_estimated_gap"] == 0.0


def test_optimal_catalog_shown_even_with_no_held_cards(test_client, db_session):
    _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[
        {"category_id": "Shopping", "multiplier": 3.0},
    ])
    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Shopping", amount=100.00, description="Solo"))
    db_session.commit()

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 1})
    row = next(c for c in res.json()["by_category"] if c["category"] == "Shopping")
    assert row["optimal_catalog_card"] == "Blue Cash Preferred"
    assert row["optimal_catalog_earned_estimate"] == 3.0


def test_actual_uses_default_held_card(test_client, db_session):
    flat_card = _seed_card(db_session, "Chase", "Freedom Unlimited", rules=[{"category_id": "All Purchases", "multiplier": 1.5}])
    grocery_card = _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[{"category_id": "Shopping", "multiplier": 6.0}])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(flat_card.id)})  # becomes default (first added)
    test_client.post("/api/v1/cards/mine", json={"card_id": str(grocery_card.id)})

    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Shopping", amount=100.00, description="Solo"))
    db_session.commit()

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 1})
    row = next(c for c in res.json()["by_category"] if c["category"] == "Shopping")
    assert row["held_card_used"] == "Freedom Unlimited"
    assert row["actual_earned_estimate"] == 1.5  # 1.5% of $100, flat rate (no exact "Shopping" rule)
    assert row["optimal_in_wallet_card"] == "Blue Cash Preferred"
    assert row["optimal_in_wallet_earned_estimate"] == 6.0
    assert res.json()["total_estimated_gap"] == pytest.approx(4.5, abs=0.01)  # 6.00 - 1.50
    # Phase 2 "better card" nudge: default card (Freedom Unlimited) != best-in-wallet card
    # (Blue Cash Preferred), so this should flag a switch opportunity.
    assert row["is_using_best_held_card"] is False


def test_is_using_best_held_card_true_when_default_is_already_optimal(test_client, db_session):
    grocery_card = _seed_card(db_session, "Amex", "Blue Cash Preferred", rules=[{"category_id": "Shopping", "multiplier": 6.0}])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(grocery_card.id)})  # sole card -> default

    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Shopping", amount=100.00, description="Solo"))
    db_session.commit()

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 1})
    row = next(c for c in res.json()["by_category"] if c["category"] == "Shopping")
    assert row["held_card_used"] == "Blue Cash Preferred"
    assert row["optimal_in_wallet_card"] == "Blue Cash Preferred"
    assert row["is_using_best_held_card"] is True


def test_group_share_uses_full_amount_paid_not_my_share(test_client, db_session, monkeypatch):
    """The core TS-CARD-105 assertion: actual_spend for the group expense's category must be
    the full $90 the user paid, never the $45 split-share AnalysisService's default scope uses."""
    monkeypatch.setenv("GROUPS_ENABLED", "true")
    _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=2)

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 2})
    assert res.status_code == 200
    body = res.json()
    assert body["filter_info"]["group_share_included"] is True

    dining_row = next(c for c in body["by_category"] if c["category"] == "Food & Drink")
    assert dining_row["actual_spend"] == 90.00  # full amount paid, not the $45 my-share
    assert dining_row["spend_source"] == "personal_plus_group_paid"

    shopping_row = next(c for c in body["by_category"] if c["category"] == "Shopping")
    assert shopping_row["actual_spend"] == 50.00


def test_group_share_excluded_when_groups_disabled(test_client, db_session, monkeypatch):
    monkeypatch.setenv("GROUPS_ENABLED", "true")
    _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=3)

    monkeypatch.setenv("GROUPS_ENABLED", "false")
    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 3})
    body = res.json()
    assert body["filter_info"]["group_share_included"] is False
    categories = {c["category"] for c in body["by_category"]}
    assert "Food & Drink" not in categories  # group data must not leak through with Groups off
    shopping_row = next(c for c in body["by_category"] if c["category"] == "Shopping")
    assert shopping_row["spend_source"] == "personal_only"


# --- TS-CARD-113: merchant-specific rules, end to end over HTTP ---

def test_coach_response_includes_merchant_row_when_rule_exists(test_client, db_session):
    card = _seed_card(db_session, "Apple", "Apple Card", rules=[
        {"category_id": "All Purchases", "multiplier": 1.0},
        {"category_id": None, "merchant_name": "Apple", "multiplier": 3.0},
    ])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})
    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Electronics", merchant_name="Apple", amount=100.0, description="Accessory"))
    db_session.commit()

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 1})
    assert res.status_code == 200
    body = res.json()

    merchant_row = next(m for m in body["by_merchant"] if m["merchant"] == "Apple")
    assert merchant_row["actual_earned_estimate"] == 3.0  # merchant rule (3%), not the 1% flat rate
    assert merchant_row["held_card_used"] == "Apple Card"

    # Category "actual" reflects the merchant carve-out too — the Option B correctness fix.
    electronics_row = next(c for c in body["by_category"] if c["category"] == "Electronics")
    assert electronics_row["actual_earned_estimate"] == 3.0


def test_coach_response_no_merchant_row_when_no_card_has_a_rule_for_it(test_client, db_session):
    card = _seed_card(db_session, "Chase", "Freedom Unlimited", rules=[{"category_id": "All Purchases", "multiplier": 1.5}])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})
    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Groceries", merchant_name="Whole Foods", amount=50.0, description="Shop"))
    db_session.commit()

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 1})
    body = res.json()
    assert body["by_merchant"] == []


def test_total_estimated_gap_excludes_merchant_gaps(test_client, db_session):
    """Headline total must stay category-only — never double-count a merchant's dollars against
    its own category's gap too (spec discussion, Option B)."""
    default_card = _seed_card(db_session, "Chase", "Freedom Unlimited", rules=[{"category_id": "All Purchases", "multiplier": 1.5}])
    apple_card = _seed_card(db_session, "Apple", "Apple Card", rules=[
        {"category_id": "All Purchases", "multiplier": 1.0},
        {"category_id": None, "merchant_name": "Apple", "multiplier": 5.0},
    ])
    test_client.post("/api/v1/cards/mine", json={"card_id": str(default_card.id)})  # becomes default
    test_client.post("/api/v1/cards/mine", json={"card_id": str(apple_card.id)})
    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Electronics", merchant_name="Apple", amount=100.0, description="Accessory"))
    db_session.commit()

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 1})
    body = res.json()

    # optimal_in_wallet for "Electronics" is deliberately category-only (ignores the Apple Card's
    # merchant rule) — both held cards only have "All Purchases" at the category level, so it's
    # a tie at 1.5% vs 1.0%; Freedom Unlimited (1.5%) wins as the plain category comparison.
    electronics_row = next(c for c in body["by_category"] if c["category"] == "Electronics")
    assert electronics_row["optimal_in_wallet_card"] == "Freedom Unlimited"
    # The merchant view correctly finds Apple Card's 5% merchant rule instead.
    merchant_row = next(m for m in body["by_merchant"] if m["merchant"] == "Apple")
    assert merchant_row["optimal_in_wallet_card"] == "Apple Card"
    assert merchant_row["optimal_in_wallet_earned_estimate"] == 5.0

    # total_estimated_gap reflects only the category view's gap_usd values, not merchant's too.
    category_gap_sum = round(sum(
        max((c["optimal_in_wallet_earned_estimate"] or 0) - (c["actual_earned_estimate"] or 0), 0)
        for c in body["by_category"] if c["actual_earned_estimate"] is not None and c["optimal_in_wallet_earned_estimate"] is not None
    ), 2)
    assert body["total_estimated_gap"] == category_gap_sum
