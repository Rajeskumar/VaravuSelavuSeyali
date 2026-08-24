"""tests/test_card_service_api.py — TS-CARD-103 catalog search + held-card CRUD."""
import os
import uuid
from datetime import datetime, timezone

import pytest

from varavu_selavu_service.db.models import CardCatalog


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


def _seed_card(db_session, issuer="Chase", card_name="Sapphire Preferred", is_active=True) -> CardCatalog:
    card = CardCatalog(
        id=uuid.uuid4(),
        issuer=issuer,
        card_name=card_name,
        reward_type="points",
        points_currency_name="Ultimate Rewards",
        point_value_estimate_usd=0.0125,
        annual_fee=95.00,
        source_url="https://example.com/card",
        last_verified_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        is_active=is_active,
    )
    db_session.add(card)
    db_session.commit()
    return card


def test_config_reflects_card_coach_enabled(test_client):
    res = test_client.get("/api/v1/config")
    assert res.status_code == 200
    assert res.json()["card_coach_enabled"] is True


def test_gate_returns_404_when_disabled(test_client, monkeypatch):
    monkeypatch.setenv("CARD_COACH_ENABLED", "false")
    res = test_client.get("/api/v1/cards/mine")
    assert res.status_code == 404


def test_search_catalog(test_client, db_session):
    _seed_card(db_session, issuer="Chase", card_name="Sapphire Preferred")
    _seed_card(db_session, issuer="Amex", card_name="Blue Cash Preferred")

    res = test_client.get("/api/v1/cards/catalog", params={"q": "chase"})
    assert res.status_code == 200
    names = [c["card_name"] for c in res.json()]
    assert names == ["Sapphire Preferred"]


def test_search_catalog_excludes_inactive(test_client, db_session):
    _seed_card(db_session, issuer="Discover", card_name="Discontinued Card", is_active=False)
    res = test_client.get("/api/v1/cards/catalog")
    assert all(c["card_name"] != "Discontinued Card" for c in res.json())


def test_catalog_detail_not_found(test_client, db_session):
    res = test_client.get(f"/api/v1/cards/catalog/{uuid.uuid4()}")
    assert res.status_code == 404


def test_catalog_detail_includes_provenance(test_client, db_session):
    card = _seed_card(db_session)
    res = test_client.get(f"/api/v1/cards/catalog/{card.id}")
    assert res.status_code == 200
    data = res.json()
    assert data["source_url"] == "https://example.com/card"
    assert data["last_verified_at"]
    assert data["earning_rules"] == []


def test_add_first_card_becomes_default(test_client, db_session):
    card = _seed_card(db_session)
    res = test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})
    assert res.status_code == 201
    data = res.json()
    assert data["is_default"] is True
    assert data["card_id"] == str(card.id)


def test_add_second_card_is_not_default(test_client, db_session):
    card1 = _seed_card(db_session, issuer="Chase", card_name="Card 1")
    card2 = _seed_card(db_session, issuer="Amex", card_name="Card 2")
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card1.id)})
    res = test_client.post("/api/v1/cards/mine", json={"card_id": str(card2.id)})
    assert res.json()["is_default"] is False

    listed = test_client.get("/api/v1/cards/mine").json()
    defaults = [c for c in listed if c["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["card_id"] == str(card1.id)


def test_add_same_card_twice_is_idempotent(test_client, db_session):
    card = _seed_card(db_session)
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})
    res = test_client.post("/api/v1/cards/mine", json={"card_id": str(card.id)})
    assert res.status_code == 201
    listed = test_client.get("/api/v1/cards/mine").json()
    assert len(listed) == 1


def test_remove_default_card_promotes_next(test_client, db_session):
    card1 = _seed_card(db_session, issuer="Chase", card_name="Card 1")
    card2 = _seed_card(db_session, issuer="Amex", card_name="Card 2")
    r1 = test_client.post("/api/v1/cards/mine", json={"card_id": str(card1.id)}).json()
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card2.id)})

    del_res = test_client.delete(f"/api/v1/cards/mine/{r1['id']}")
    assert del_res.status_code == 200

    listed = test_client.get("/api/v1/cards/mine").json()
    assert len(listed) == 1
    assert listed[0]["card_id"] == str(card2.id)
    assert listed[0]["is_default"] is True


def test_remove_nonexistent_card_404s(test_client, db_session):
    res = test_client.delete(f"/api/v1/cards/mine/{uuid.uuid4()}")
    assert res.status_code == 404


def test_set_default_card(test_client, db_session):
    card1 = _seed_card(db_session, issuer="Chase", card_name="Card 1")
    card2 = _seed_card(db_session, issuer="Amex", card_name="Card 2")
    test_client.post("/api/v1/cards/mine", json={"card_id": str(card1.id)})
    r2 = test_client.post("/api/v1/cards/mine", json={"card_id": str(card2.id)}).json()

    res = test_client.post(f"/api/v1/cards/mine/{r2['id']}/set_default")
    assert res.status_code == 200
    assert res.json()["is_default"] is True

    listed = test_client.get("/api/v1/cards/mine").json()
    defaults = [c for c in listed if c["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == r2["id"]


# --- TS-CARD-110: data-correction reporting ---

def test_file_correction(test_client, db_session):
    card = _seed_card(db_session)
    res = test_client.post("/api/v1/cards/corrections", json={
        "card_id": str(card.id),
        "note": "Multiplier for dining looks outdated — issuer site now shows 4x, not 3x.",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["card_id"] == str(card.id)
    assert data["status"] == "open"
    assert "4x" in data["note"]


def test_file_correction_unknown_card_404s(test_client, db_session):
    res = test_client.post("/api/v1/cards/corrections", json={
        "card_id": str(uuid.uuid4()),
        "note": "This card doesn't exist.",
    })
    assert res.status_code == 404


def test_file_correction_gated_by_flag(test_client, db_session, monkeypatch):
    card = _seed_card(db_session)
    monkeypatch.setenv("CARD_COACH_ENABLED", "false")
    res = test_client.post("/api/v1/cards/corrections", json={"card_id": str(card.id), "note": "note"})
    assert res.status_code == 404
