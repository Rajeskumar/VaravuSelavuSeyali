"""tests/test_custom_cards.py — TS-CARD-112 user-added custom cards."""
import os
import uuid
from datetime import datetime, timezone

import pytest

from varavu_selavu_service.db.models import CardCatalog, Expense, User


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


def _seed_curated_card(db_session) -> CardCatalog:
    card = CardCatalog(
        id=uuid.uuid4(), issuer="Chase", card_name="Sapphire Preferred", reward_type="points",
        annual_fee=95, source_url="https://example.com", last_verified_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(card)
    db_session.commit()
    return card


def test_create_custom_card_and_auto_hold(test_client, db_session):
    res = test_client.post("/api/v1/cards/custom", json={
        "card_name": "My Local CU Card",
        "issuer": "Hometown CU",
        "annual_fee": 0,
        "rules": [{"category_id": "Groceries", "multiplier": 5.0}],
    })
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["card_name"] == "My Local CU Card"
    assert data["is_custom"] is True
    assert data["is_default"] is True  # first card auto-defaults, same as curated cards

    # Auto-held — no separate POST /cards/mine call needed.
    mine = test_client.get("/api/v1/cards/mine").json()
    assert len(mine) == 1
    assert mine[0]["card_name"] == "My Local CU Card"


def test_create_custom_card_rejects_unknown_category(test_client, db_session):
    res = test_client.post("/api/v1/cards/custom", json={
        "card_name": "Bad Card",
        "rules": [{"category_id": "Not A Real Category", "multiplier": 5.0}],
    })
    assert res.status_code == 422


def test_create_custom_card_accepts_all_purchases_sentinel(test_client, db_session):
    res = test_client.post("/api/v1/cards/custom", json={
        "card_name": "Flat Card",
        "rules": [{"category_id": "All Purchases", "multiplier": 2.0}],
    })
    assert res.status_code == 201


def test_create_custom_card_with_no_rules_is_allowed(test_client, db_session):
    """Spec follow-up decision: no forced 'All Purchases' fallback — some store-only cards
    genuinely earn nothing outside their specific categories."""
    res = test_client.post("/api/v1/cards/custom", json={"card_name": "Store Card Only", "rules": []})
    assert res.status_code == 201


def test_custom_card_defaults_issuer_when_omitted(test_client, db_session):
    res = test_client.post("/api/v1/cards/custom", json={"card_name": "No Issuer Given", "rules": []})
    assert res.json()["issuer"] == "Custom"


def test_custom_card_not_visible_in_another_users_search(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()

    from varavu_selavu_service.services.card_service import CardService
    other_svc = CardService(db_session)
    card, _ = other_svc.create_custom_card("other@user.com", "Other's Secret Card", None, 0.0, [])

    # test@user.com (the default auth override) must never see it in search.
    res = test_client.get("/api/v1/cards/catalog", params={"q": "Secret"})
    assert res.status_code == 200
    assert res.json() == []


def test_custom_card_detail_404s_for_non_owner(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()
    from varavu_selavu_service.services.card_service import CardService
    other_svc = CardService(db_session)
    card, _ = other_svc.create_custom_card("other@user.com", "Other's Secret Card", None, 0.0, [])

    res = test_client.get(f"/api/v1/cards/catalog/{card.id}")
    assert res.status_code == 404


def test_cannot_add_another_users_custom_card_by_guessed_id(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()
    from varavu_selavu_service.services.card_service import CardService
    other_svc = CardService(db_session)
    card, _ = other_svc.create_custom_card("other@user.com", "Other's Secret Card", None, 0.0, [])

    res = test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})
    assert res.status_code == 404


def test_removing_custom_card_deletes_it_entirely(test_client, db_session):
    res = test_client.post("/api/v1/cards/custom", json={"card_name": "Temp Card", "rules": [{"category_id": "Groceries", "multiplier": 3.0}]})
    user_card_id = res.json()["id"]
    card_id = res.json()["card_id"]

    del_res = test_client.delete(f"/api/v1/cards/mine/{user_card_id}")
    assert del_res.status_code == 200

    # Fully gone, not just unlinked — a second lookup 404s.
    detail_res = test_client.get(f"/api/v1/cards/catalog/{card_id}")
    assert detail_res.status_code == 404
    assert db_session.query(CardCatalog).filter(CardCatalog.id == uuid.UUID(card_id)).first() is None


def test_removing_curated_card_does_not_delete_catalog_row(test_client, db_session):
    card = _seed_curated_card(db_session)
    add_res = test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})
    test_client.delete(f"/api/v1/cards/mine/{add_res.json()['id']}")

    # Still there — curated cards are shared, never deleted just because one user removed it.
    assert db_session.query(CardCatalog).filter(CardCatalog.id == card.id).first() is not None


def test_custom_card_excluded_from_optimal_catalog_comparison(test_client, db_session):
    """A custom card must never be suggested as the cross-user 'optimal in catalog' pick —
    it's one user's private, unverified self-report, not curated/shared data."""
    from varavu_selavu_service.services.card_service import CardService
    svc = CardService(db_session)
    # A different user's absurdly generous custom card should never leak into anyone else's
    # "optimal catalog" comparison, even indirectly.
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()
    other_svc = CardService(db_session)
    other_svc.create_custom_card("other@user.com", "Absurd 50% Card", None, 0.0, [{"category_id": "Groceries", "multiplier": 50.0}])

    _seed_curated_card(db_session)  # ensure the catalog isn't empty
    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Groceries", amount=100.0, description="Shop"))
    db_session.commit()

    gaps, _merchant_gaps, _ = svc.compute_coach_gaps("test@user.com", year=2026, month=1, groups_enabled=False)
    groceries = next(g for g in gaps if g.category == "Groceries")
    assert groceries.optimal_catalog is None or groceries.optimal_catalog.card_name != "Absurd 50% Card"
