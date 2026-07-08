import os
import uuid

import pytest

from varavu_selavu_service.auth.security import auth_required
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


def _as_user(email: str):
    old = app.dependency_overrides.get(auth_required)
    app.dependency_overrides[auth_required] = lambda: email
    return old


def _restore(old):
    if old is not None:
        app.dependency_overrides[auth_required] = old
    else:
        app.dependency_overrides.pop(auth_required, None)


def _make_group_with_expense(test_client, db_session):
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    admin_id = str(db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com").first().id)

    exp_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 30.00,
            "payers": [{"member_id": admin_id, "amount_paid": 30.00}],
            "split": {"type": "equal", "entries": [{"member_id": admin_id}]},
        },
    )
    return group_id, exp_res.json()["expense"]["row_id"], admin_id


def test_history_shows_creation_only_before_any_edit(test_client, db_session):
    group_id, expense_id, _ = _make_group_with_expense(test_client, db_session)
    res = test_client.get(f"/api/v1/groups/{group_id}/expenses/{expense_id}/history")
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["action"] == "expense_created"


def test_history_shows_real_diff_after_edit(test_client, db_session):
    group_id, expense_id, admin_id = _make_group_with_expense(test_client, db_session)

    test_client.put(
        f"/api/v1/groups/{group_id}/expenses/{expense_id}",
        json={
            "date": "01/15/2026",
            "description": "Dinner at Luigi's",
            "category": "Food & Drink",
            "amount": 27.00,
            "payers": [{"member_id": admin_id, "amount_paid": 27.00}],
            "split": {"type": "equal", "entries": [{"member_id": admin_id}]},
        },
    )

    res = test_client.get(f"/api/v1/groups/{group_id}/expenses/{expense_id}/history")
    items = res.json()["items"]
    assert len(items) == 2
    edit_entry = items[1]
    assert edit_entry["action"] == "expense_updated"
    assert edit_entry["changed_fields"]["amount"] == {"from": 30.0, "to": 27.0}
    assert edit_entry["changed_fields"]["description"] == {"from": "Dinner", "to": "Dinner at Luigi's"}
    assert "category" not in edit_entry["changed_fields"]


def test_non_member_cannot_view_history(test_client, db_session):
    group_id, expense_id, _ = _make_group_with_expense(test_client, db_session)
    db_session.add(User(id=uuid.uuid4(), email="stranger@test.com", password_hash="hash"))
    db_session.commit()
    old = _as_user("stranger@test.com")
    try:
        res = test_client.get(f"/api/v1/groups/{group_id}/expenses/{expense_id}/history")
        assert res.status_code == 403
    finally:
        _restore(old)
