"""tests/test_card_attribution.py — TS-CARD-114: optional per-expense "which held card did I
use" attribution, on both personal and group expenses, and its effect on the Card Coach "actual
earned" figure via GET /cards/coach."""
import os
import uuid
from datetime import datetime, timezone

import pytest

from varavu_selavu_service.db.models import CardCatalog, CardEarningRule, Group, GroupMember, User


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


def _seed_card(db_session, card_name, multiplier, category="Groceries", reward_type="cashback") -> CardCatalog:
    card = CardCatalog(
        id=uuid.uuid4(), issuer="Test Bank", card_name=card_name, reward_type=reward_type,
        annual_fee=0, source_url="https://example.com", last_verified_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(card)
    db_session.add(CardEarningRule(id=uuid.uuid4(), card_id=card.id, category_id="All Purchases", multiplier=1.0))
    db_session.add(CardEarningRule(id=uuid.uuid4(), card_id=card.id, category_id=category, multiplier=multiplier))
    db_session.commit()
    return card


def _hold_card(test_client, card_id) -> str:
    """Adds the card to the (already-authenticated) test user's wallet and returns its
    UserCard id — held cards route doesn't expose that directly, so this re-derives it via
    GET /cards/mine, matching how the web/mobile clients would."""
    res = test_client.post("/api/v1/cards/mine", json={"card_id": str(card_id)})
    assert res.status_code == 201
    return res.json()["id"]


# --- Personal expenses ---

def test_create_personal_expense_rejects_unheld_card(test_client, db_session):
    other_card = _seed_card(db_session, "Not My Card", multiplier=5.0)
    res = test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 50.0, "category": "Groceries",
        "description": "Trader Joe's", "date": "08/20/2026", "card_id": str(other_card.id),
    })
    assert res.status_code == 400


def test_create_and_get_personal_expense_with_attributed_card(test_client, db_session):
    card = _seed_card(db_session, "Chase Freedom", multiplier=6.0)
    _hold_card(test_client, card.id)

    res = test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 50.0, "category": "Groceries",
        "description": "Trader Joe's", "date": "08/20/2026", "card_id": str(card.id),
    })
    assert res.status_code == 201
    body = res.json()["expense"]
    assert body["card"]["id"] == str(card.id)
    assert body["card"]["card_name"] == "Chase Freedom"

    list_res = test_client.get("/api/v1/expenses")
    row = list_res.json()["items"][0]
    assert row["card"]["id"] == str(card.id)


def test_update_personal_expense_can_change_and_clear_card(test_client, db_session):
    card_a = _seed_card(db_session, "Card A", multiplier=6.0)
    card_b = _seed_card(db_session, "Card B", multiplier=3.0)
    _hold_card(test_client, card_a.id)
    _hold_card(test_client, card_b.id)

    create_res = test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 50.0, "category": "Groceries",
        "description": "Trader Joe's", "date": "08/20/2026", "card_id": str(card_a.id),
    })
    assert create_res.status_code == 201
    row_id = test_client.get("/api/v1/expenses").json()["items"][0]["row_id"]

    # Switch to card B.
    update_res = test_client.put(f"/api/v1/expenses/{row_id}", json={
        "user_id": "test@user.com", "cost": 50.0, "category": "Groceries",
        "description": "Trader Joe's", "date": "08/20/2026", "card_id": str(card_b.id),
    })
    assert update_res.status_code == 200
    assert update_res.json()["expense"]["card"]["id"] == str(card_b.id)

    # Clear it (card_id omitted -> None -> always-replace semantics clear it, matching
    # merchant_name's own always-replace behavior).
    clear_res = test_client.put(f"/api/v1/expenses/{row_id}", json={
        "user_id": "test@user.com", "cost": 50.0, "category": "Groceries",
        "description": "Trader Joe's", "date": "08/20/2026",
    })
    assert clear_res.status_code == 200
    assert clear_res.json()["expense"]["card"] is None


def test_update_personal_expense_rejects_unheld_card(test_client, db_session):
    held = _seed_card(db_session, "Held Card", multiplier=6.0)
    not_held = _seed_card(db_session, "Not Held", multiplier=5.0)
    _hold_card(test_client, held.id)

    create_res = test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 50.0, "category": "Groceries",
        "description": "Trader Joe's", "date": "08/20/2026",
    })
    row_id = test_client.get("/api/v1/expenses").json()["items"][0]["row_id"]

    res = test_client.put(f"/api/v1/expenses/{row_id}", json={
        "user_id": "test@user.com", "cost": 50.0, "category": "Groceries",
        "description": "Trader Joe's", "date": "08/20/2026", "card_id": str(not_held.id),
    })
    assert res.status_code == 400


def test_deleting_the_underlying_card_clears_attribution_via_set_null(test_client, db_session):
    """SET NULL on delete, not CASCADE — deleting the card an expense was attributed to must
    never delete the expense itself, it just drops back to unattributed. Unholding a CURATED
    card never deletes its CardCatalog row (other users may still hold the same card), so this
    exercises the one path that actually deletes a CardCatalog row: removing a CUSTOM card,
    which is deleted along with its sole holder's UserCard (CardService.remove_user_card)."""
    create_res = test_client.post("/api/v1/cards/custom", json={
        "card_name": "My Private Card", "issuer": "Me", "annual_fee": 0,
        "rules": [{"category_id": "Groceries", "multiplier": 6.0}],
    })
    assert create_res.status_code == 201
    custom = create_res.json()
    card_id = custom["card_id"]
    user_card_id = custom["id"]

    expense_res = test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 50.0, "category": "Groceries",
        "description": "Trader Joe's", "date": "08/20/2026", "card_id": card_id,
    })
    assert expense_res.status_code == 201

    del_res = test_client.delete(f"/api/v1/cards/mine/{user_card_id}")
    assert del_res.status_code in (200, 204)

    row = test_client.get("/api/v1/expenses").json()["items"][0]
    assert row["card"] is None


# --- Card Coach "actual earned" reflects attribution, not just the default card ---

def test_card_coach_actual_earned_uses_attributed_card_not_default(test_client, db_session):
    default_card = _seed_card(db_session, "Default Flat 1%", multiplier=1.0, category="All Purchases")
    better_card = _seed_card(db_session, "Groceries 6%", multiplier=6.0, category="Groceries")
    _hold_card(test_client, default_card.id)  # first held card becomes default
    _hold_card(test_client, better_card.id)

    test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 100.0, "category": "Groceries",
        "description": "Costco", "date": "08/20/2026", "card_id": str(better_card.id),
    })

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 8})
    assert res.status_code == 200
    groceries = next(r for r in res.json()["by_category"] if r["category"] == "Groceries")
    # 6% of $100 on the attributed card, not 1% of $100 on the default.
    assert groceries["actual_earned_estimate"] == pytest.approx(6.0)
    assert groceries["held_card_used"] == "Groceries 6%"


def test_card_coach_actual_earned_falls_back_to_default_when_unattributed(test_client, db_session):
    default_card = _seed_card(db_session, "Default Flat 1%", multiplier=1.0, category="All Purchases")
    _hold_card(test_client, default_card.id)

    test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 100.0, "category": "Groceries",
        "description": "Costco", "date": "08/20/2026",
    })

    res = test_client.get("/api/v1/cards/coach", params={"year": 2026, "month": 8})
    groceries = next(r for r in res.json()["by_category"] if r["category"] == "Groceries")
    assert groceries["actual_earned_estimate"] == pytest.approx(1.0)
    assert groceries["held_card_used"] == "Default Flat 1%"


# --- Group expenses ---

def _make_group(test_client, name="Trip"):
    res = test_client.post("/api/v1/groups", json={"name": name})
    assert res.status_code == 201
    group_id = res.json()["group_id"]
    detail = test_client.get(f"/api/v1/groups/{group_id}").json()
    member_id = detail["members"][0]["member_id"]
    return group_id, member_id


def test_create_group_expense_rejects_unheld_card(test_client, db_session):
    group_id, member_id = _make_group(test_client)
    not_held = _seed_card(db_session, "Not Held", multiplier=5.0)

    res = test_client.post(f"/api/v1/groups/{group_id}/expenses", json={
        "date": "08/20/2026", "description": "Dinner", "category": "Dining out", "amount": 40.0,
        "payers": [{"member_id": member_id, "amount_paid": 40.0}],
        "split": {"type": "equal", "entries": [{"member_id": member_id}]},
        "card_id": str(not_held.id),
    })
    assert res.status_code == 400


def test_create_and_update_group_expense_with_attributed_card(test_client, db_session):
    group_id, member_id = _make_group(test_client)
    card = _seed_card(db_session, "Group Card", multiplier=3.0, category="Dining out")
    _hold_card(test_client, card.id)

    create_res = test_client.post(f"/api/v1/groups/{group_id}/expenses", json={
        "date": "08/20/2026", "description": "Dinner", "category": "Dining out", "amount": 40.0,
        "payers": [{"member_id": member_id, "amount_paid": 40.0}],
        "split": {"type": "equal", "entries": [{"member_id": member_id}]},
        "card_id": str(card.id),
    })
    assert create_res.status_code == 201
    row = create_res.json()["expense"]
    assert row["card"]["id"] == str(card.id)
    expense_id = row["row_id"]

    # Clearing on update (card_id omitted -> None, always-replace like merchant_name).
    update_res = test_client.put(f"/api/v1/groups/{group_id}/expenses/{expense_id}", json={
        "date": "08/20/2026", "description": "Dinner", "category": "Dining out", "amount": 40.0,
        "payers": [{"member_id": member_id, "amount_paid": 40.0}],
        "split": {"type": "equal", "entries": [{"member_id": member_id}]},
    })
    assert update_res.status_code == 200
    assert update_res.json()["expense"]["card"] is None
