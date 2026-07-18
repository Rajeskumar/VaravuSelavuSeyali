import os
import uuid

import pytest

from varavu_selavu_service.db.models import CanonicalMerchant, EntityAlias
from varavu_selavu_service.services.entity_resolution_service import Candidate, EntityResolutionService


@pytest.fixture(autouse=True)
def _entity_resolution_enabled():
    old_val = os.environ.get("ENTITY_RESOLUTION_ENABLED")
    os.environ["ENTITY_RESOLUTION_ENABLED"] = "true"
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["ENTITY_RESOLUTION_ENABLED"] = old_val
        else:
            os.environ.pop("ENTITY_RESOLUTION_ENABLED", None)


def test_entity_resolution_routes_404_when_disabled(test_client):
    os.environ["ENTITY_RESOLUTION_ENABLED"] = "false"
    try:
        res = test_client.post("/api/v1/resolve/merchant", json={"raw": "Costco"})
        assert res.status_code == 404
    finally:
        os.environ["ENTITY_RESOLUTION_ENABLED"] = "true"


def test_resolve_merchant_exact_match_links(test_client, db_session):
    merchant = CanonicalMerchant(
        id=uuid.uuid4(), user_email=None, canonical_name="costco wholesale",
        display_name="Costco Wholesale", is_global=True,
    )
    db_session.add(merchant)
    db_session.commit()

    res = test_client.post("/api/v1/resolve/merchant", json={"raw": "Costco Wholesale"})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "linked"
    assert body["canonical"]["display_name"] == "Costco Wholesale"
    assert body["candidates"] == []


def test_resolve_merchant_alias_match_links(test_client, db_session):
    merchant = CanonicalMerchant(
        id=uuid.uuid4(), user_email=None, canonical_name="costco wholesale",
        display_name="Costco Wholesale", is_global=True,
    )
    db_session.add(merchant)
    db_session.commit()
    alias = EntityAlias(
        id=uuid.uuid4(), user_email=None, entity_type="merchant", entity_id=merchant.id,
        raw_key="cosco", source="seed", confidence=None, confirmed=True,
    )
    db_session.add(alias)
    db_session.commit()

    res = test_client.post("/api/v1/resolve/merchant", json={"raw": "cosco"})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "linked"
    assert body["canonical"]["display_name"] == "Costco Wholesale"


def test_create_canonical_merchant(test_client, db_session):
    res = test_client.post("/api/v1/canonical/merchants", json={"display_name": "Joe's Pizza"})
    assert res.status_code == 201
    body = res.json()
    assert body["display_name"] == "Joe's Pizza"
    assert body["canonical_name"] == "joe s pizza"
    assert body["is_global"] is False

    row = db_session.query(CanonicalMerchant).filter(CanonicalMerchant.id == uuid.UUID(body["id"])).first()
    assert row is not None
    assert row.user_email == "test@user.com"


def test_create_canonical_item(test_client, db_session):
    res = test_client.post(
        "/api/v1/canonical/items", json={"display_name": "Organic Bananas", "brand": "Dole"}
    )
    assert res.status_code == 201
    body = res.json()
    assert body["display_name"] == "Organic Bananas"
    assert body["brand"] == "Dole"
    # item-style normalization singularizes the trailing token
    assert body["canonical_name"] == "organic banana"


def test_suggest_merchants_wires_through_to_service(test_client, monkeypatch):
    # suggest() relies on pg_trgm's similarity(), which SQLite (this test
    # suite's engine) doesn't implement — real trigram behavior is only
    # exercised against live Postgres. Here we only verify the route wires
    # auth/flag/serialization correctly, mirroring how resolve()'s tier-3+
    # trigram path is monkeypatched in test_entity_resolution_service.py.
    def fake_suggest(self, query, entity_type, user_email, merchant_id=None, limit=20):
        assert entity_type == "merchant"
        return [Candidate(id=str(uuid.uuid4()), display_name="Costco Wholesale", score=0.9, category_id=None)]

    monkeypatch.setattr(EntityResolutionService, "suggest", fake_suggest)

    res = test_client.get("/api/v1/suggest/merchants", params={"q": "cos"})
    assert res.status_code == 200
    body = res.json()
    assert len(body["suggestions"]) == 1
    assert body["suggestions"][0]["display_name"] == "Costco Wholesale"
    assert body["suggestions"][0]["score"] == 0.9


def test_suggest_items_passes_merchant_id_through(test_client, monkeypatch):
    seen = {}

    def fake_suggest(self, query, entity_type, user_email, merchant_id=None, limit=20):
        seen["entity_type"] = entity_type
        seen["merchant_id"] = merchant_id
        return []

    monkeypatch.setattr(EntityResolutionService, "suggest", fake_suggest)

    res = test_client.get("/api/v1/suggest/items", params={"q": "ban", "merchant_id": "abc-123"})
    assert res.status_code == 200
    assert res.json() == {"suggestions": []}
    assert seen == {"entity_type": "item", "merchant_id": "abc-123"}
