import os
import uuid

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import ExpenseComment, Group, GroupMember, User
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


def _make_group_with_expense(test_client, db_session, other_email="member2@test.com"):
    db_session.add(User(id=uuid.uuid4(), email=other_email, password_hash="hash", name="Member Two"))
    db_session.commit()
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": other_email})

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
    expense_id = exp_res.json()["expense"]["row_id"]
    return group_id, expense_id, other_email


def test_add_and_list_comments(test_client, db_session):
    group_id, expense_id, _ = _make_group_with_expense(test_client, db_session)

    res = test_client.post(f"/api/v1/groups/{group_id}/expenses/{expense_id}/comments", json={"body": "Split the wine 50/50"})
    assert res.status_code == 201
    assert res.json()["body"] == "Split the wine 50/50"
    assert res.json()["author_display_name"]

    res = test_client.get(f"/api/v1/groups/{group_id}/expenses/{expense_id}/comments")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1


def test_non_member_cannot_comment(test_client, db_session):
    group_id, expense_id, _ = _make_group_with_expense(test_client, db_session)
    old = _as_user("stranger@test.com")
    try:
        db_session.add(User(id=uuid.uuid4(), email="stranger@test.com", password_hash="hash"))
        db_session.commit()
        res = test_client.post(f"/api/v1/groups/{group_id}/expenses/{expense_id}/comments", json={"body": "hi"})
        assert res.status_code == 403
    finally:
        _restore(old)


def test_only_author_can_delete_comment(test_client, db_session):
    group_id, expense_id, other_email = _make_group_with_expense(test_client, db_session)

    comment_id = test_client.post(
        f"/api/v1/groups/{group_id}/expenses/{expense_id}/comments", json={"body": "mine"}
    ).json()["id"]

    old = _as_user(other_email)
    try:
        res = test_client.delete(f"/api/v1/groups/{group_id}/expenses/{expense_id}/comments/{comment_id}")
        assert res.status_code == 403
    finally:
        _restore(old)

    res = test_client.delete(f"/api/v1/groups/{group_id}/expenses/{expense_id}/comments/{comment_id}")
    assert res.status_code == 200
    assert db_session.query(ExpenseComment).filter(ExpenseComment.id == uuid.UUID(comment_id)).first() is None


def test_empty_comment_rejected(test_client, db_session):
    group_id, expense_id, _ = _make_group_with_expense(test_client, db_session)
    res = test_client.post(f"/api/v1/groups/{group_id}/expenses/{expense_id}/comments", json={"body": "   "})
    assert res.status_code == 400
