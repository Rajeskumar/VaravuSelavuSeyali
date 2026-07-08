import os
import uuid

import pytest

from varavu_selavu_service.db.models import Group, GroupMember, User
from varavu_selavu_service.main import app


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


def _member_id(db_session, group_id, email):
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    m = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == email).first()
    return str(m.id)


def _add_itemized_expense(test_client, group_id, payer_id, item_name, normalized, assignee_id, fingerprint):
    return test_client.post(
        f"/api/v1/groups/{group_id}/expenses/itemized",
        json={
            "date": "01/15/2026",
            "description": "Groceries",
            "category": "Food & Drink",
            "amount": 5.0,
            "payers": [{"member_id": payer_id, "amount_paid": 5.0}],
            "items": [
                {
                    "line_no": 1,
                    "item_name": item_name,
                    "normalized_name": normalized,
                    "line_total": 5.0,
                    "member_ratios": {assignee_id: 1.0},
                }
            ],
        },
    )


def test_suggests_member_who_usually_buys_item(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="alice@test.com", password_hash="hash", name="Alice"))
    db_session.commit()
    group_id = test_client.post("/api/v1/groups", json={"name": "Apartment"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "alice@test.com"})

    admin_id = _member_id(db_session, group_id, "test@user.com")
    alice_id = _member_id(db_session, group_id, "alice@test.com")

    # Alice buys "Oat Milk" 3 times.
    for _ in range(3):
        _add_itemized_expense(test_client, group_id, admin_id, "Oat Milk", "oat milk", alice_id, None)

    res = test_client.get(f"/api/v1/groups/{group_id}/items/suggest_assignment", params={"item_name": "oat milk"})
    assert res.status_code == 200
    suggestions = res.json()["suggestions"]
    assert suggestions[0]["member_id"] == alice_id
    assert suggestions[0]["times_assigned"] == 3


def test_no_history_returns_no_suggestion(test_client, db_session):
    group_id = test_client.post("/api/v1/groups", json={"name": "Apartment"}).json()["group_id"]
    res = test_client.get(f"/api/v1/groups/{group_id}/items/suggest_assignment", params={"item_name": "kombucha"})
    assert res.status_code == 200
    assert res.json()["suggestions"] == []


def test_case_and_whitespace_insensitive_matching(test_client, db_session):
    group_id = test_client.post("/api/v1/groups", json={"name": "Apartment"}).json()["group_id"]
    admin_id = _member_id(db_session, group_id, "test@user.com")
    for _ in range(3):
        _add_itemized_expense(test_client, group_id, admin_id, "Paper Towels", "paper towels", admin_id, None)

    res = test_client.get(f"/api/v1/groups/{group_id}/items/suggest_assignment", params={"item_name": "  PAPER TOWELS  "})
    suggestions = res.json()["suggestions"]
    assert suggestions[0]["member_id"] == admin_id
