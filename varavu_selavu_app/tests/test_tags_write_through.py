"""tests/test_tags_write_through.py — TS-TAG-104: tag_names on POST /expenses,
PUT /expenses/{row_id}, and POST /expenses/with_items (PRD §10.2)."""
import os

import pytest

from varavu_selavu_service.db.models import ExpenseTag


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


# ─── POST /expenses ────────────────────────────────


def test_create_expense_with_tag_names(test_client, db_session):
    res = test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 20.0, "category": "Shopping",
        "description": "Souvenir", "date": "08/15/2026", "tag_names": ["Trip 1"],
    })
    assert res.status_code == 201, res.text
    assert [t["name"] for t in res.json()["expense"]["tags"]] == ["Trip 1"]


def test_create_expense_without_tag_names_has_empty_tags(test_client, db_session):
    res = test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 20.0, "category": "Shopping",
        "description": "Souvenir", "date": "08/15/2026",
    })
    assert res.status_code == 201
    assert res.json()["expense"]["tags"] == []


def test_create_expense_with_empty_tag_names_list_has_empty_tags(test_client, db_session):
    res = test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 20.0, "category": "Shopping",
        "description": "Souvenir", "date": "08/15/2026", "tag_names": [],
    })
    assert res.status_code == 201
    assert res.json()["expense"]["tags"] == []


def test_create_expense_tag_names_creates_new_tag_inline(test_client, db_session):
    from varavu_selavu_service.db.models import Tag
    res = test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 20.0, "category": "Shopping",
        "description": "Souvenir", "date": "08/15/2026", "tag_names": ["Brand New Tag"],
    })
    assert res.status_code == 201
    assert db_session.query(Tag).filter(Tag.user_email == "test@user.com", Tag.name == "Brand New Tag").first() is not None


# ─── PUT /expenses/{row_id} ────────────────────────────────


def _create(test_client, tag_names=None):
    payload = {"user_id": "test@user.com", "cost": 20.0, "category": "Shopping", "description": "Souvenir", "date": "08/15/2026"}
    if tag_names is not None:
        payload["tag_names"] = tag_names
    return test_client.post("/api/v1/expenses", json=payload).json()["expense"]


def test_update_expense_omitted_tag_names_leaves_tags_unchanged(test_client, db_session):
    created = _create(test_client, tag_names=["Trip 1"])
    row_id = [r["row_id"] for r in test_client.get("/api/v1/expenses").json()["items"] if r["description"] == "Souvenir"][0]

    res = test_client.put(f"/api/v1/expenses/{row_id}", json={
        "user_id": "test@user.com", "cost": 25.0, "category": "Shopping", "description": "Souvenir (updated)", "date": "08/15/2026",
    })
    assert res.status_code == 200
    assert [t["name"] for t in res.json()["expense"]["tags"]] == ["Trip 1"]


def test_update_expense_explicit_empty_tag_names_clears_tags(test_client, db_session):
    _create(test_client, tag_names=["Trip 1"])
    row_id = [r["row_id"] for r in test_client.get("/api/v1/expenses").json()["items"] if r["description"] == "Souvenir"][0]

    res = test_client.put(f"/api/v1/expenses/{row_id}", json={
        "user_id": "test@user.com", "cost": 25.0, "category": "Shopping", "description": "Souvenir", "date": "08/15/2026", "tag_names": [],
    })
    assert res.status_code == 200
    assert res.json()["expense"]["tags"] == []
    assert db_session.query(ExpenseTag).count() == 0


def test_update_expense_replaces_tag_set_not_additive(test_client, db_session):
    """Full-replace semantics (PRD §10.2), distinct from the additive association endpoint."""
    _create(test_client, tag_names=["Trip 1", "Old Tag"])
    row_id = [r["row_id"] for r in test_client.get("/api/v1/expenses").json()["items"] if r["description"] == "Souvenir"][0]

    res = test_client.put(f"/api/v1/expenses/{row_id}", json={
        "user_id": "test@user.com", "cost": 25.0, "category": "Shopping", "description": "Souvenir", "date": "08/15/2026", "tag_names": ["New Tag"],
    })
    assert res.status_code == 200
    assert [t["name"] for t in res.json()["expense"]["tags"]] == ["New Tag"]


def test_update_expense_tag_names_enforces_max_per_expense(test_client, db_session, monkeypatch):
    monkeypatch.setenv("TAG_MAX_PER_EXPENSE", "1")
    _create(test_client)
    row_id = [r["row_id"] for r in test_client.get("/api/v1/expenses").json()["items"] if r["description"] == "Souvenir"][0]

    res = test_client.put(f"/api/v1/expenses/{row_id}", json={
        "user_id": "test@user.com", "cost": 25.0, "category": "Shopping", "description": "Souvenir", "date": "08/15/2026", "tag_names": ["A", "B"],
    })
    assert res.status_code == 422


# ─── POST /expenses/with_items ────────────────────────────────


def test_create_expense_with_items_applies_tag_names(test_client, db_session):
    res = test_client.post("/api/v1/expenses/with_items", json={
        "user_email": "test@user.com",
        "header": {"purchased_at": "2026-08-15T00:00:00", "amount": "12.00", "description": "Groceries"},
        "items": [{"line_no": 1, "item_name": "Milk", "line_total": "12.00"}],
        "tag_names": ["Groceries Trip"],
    })
    assert res.status_code == 201, res.text
    expense_id = res.json()["expense_id"]

    row = next(r for r in test_client.get("/api/v1/expenses").json()["items"] if r["row_id"] == expense_id)
    assert [t["name"] for t in row["tags"]] == ["Groceries Trip"]
