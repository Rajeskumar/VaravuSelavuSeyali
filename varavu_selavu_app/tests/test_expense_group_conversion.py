import os
import uuid
from datetime import datetime, timezone

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, Group, GroupMember, User
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


def _make_personal_expense(db_session, owner_email="test@user.com", amount=90.0):
    expense = Expense(
        id=uuid.uuid4(),
        user_email=owner_email,
        group_id=None,
        purchased_at=datetime(2026, 2, 10, tzinfo=timezone.utc),
        category_id="Food & Drink",
        amount=amount,
        description="Dinner",
    )
    db_session.add(expense)
    db_session.commit()
    return expense


def _member_id(db_session, group_id, email):
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    m = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == email).first()
    return str(m.id)


def test_convert_personal_expense_success(test_client, db_session):
    expense = _make_personal_expense(db_session)
    db_session.add(User(id=uuid.uuid4(), email="friend@test.com", password_hash="hash", name="Friend"))
    db_session.commit()
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "friend@test.com"})

    admin_id = _member_id(db_session, group_id, "test@user.com")
    friend_id = _member_id(db_session, group_id, "friend@test.com")

    res = test_client.post(
        f"/api/v1/expenses/{expense.id}/move_to_group",
        json={
            "group_id": group_id,
            "split": {"type": "equal", "entries": [{"member_id": admin_id}, {"member_id": friend_id}]},
        },
    )
    assert res.status_code == 200
    body = res.json()["expense"]
    assert body["my_share"] == 45.0
    assert body["payer_summary"] == [{"member_id": admin_id, "amount_paid": 90.0}]

    db_session.refresh(expense)
    assert str(expense.group_id) == group_id
    assert expense.split_type == "equal"

    payers = db_session.query(ExpensePayer).filter(ExpensePayer.expense_id == expense.id).all()
    assert len(payers) == 1
    assert float(payers[0].amount_paid) == 90.0

    splits = db_session.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).all()
    assert sum(float(s.amount_owed) for s in splits) == 90.0

    # No longer appears in the personal expense list (group_id IS NOT NULL guard).
    personal = test_client.get("/api/v1/expenses", params={"user_id": "test@user.com"}).json()
    assert all(e["row_id"] != str(expense.id) for e in personal["items"])

    # Appears in the group's expense list instead.
    group_expenses = test_client.get(f"/api/v1/groups/{group_id}/expenses").json()
    assert any(e["row_id"] == str(expense.id) for e in group_expenses["items"])


def test_non_owner_cannot_convert(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="someoneelse@test.com", password_hash="hash"))
    db_session.commit()
    expense = _make_personal_expense(db_session, owner_email="someoneelse@test.com")
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    admin_id = _member_id(db_session, group_id, "test@user.com")

    res = test_client.post(
        f"/api/v1/expenses/{expense.id}/move_to_group",
        json={"group_id": group_id, "split": {"type": "equal", "entries": [{"member_id": admin_id}]}},
    )
    assert res.status_code == 403


def test_converting_into_group_actor_is_not_a_member_of_fails(test_client, db_session):
    expense = _make_personal_expense(db_session)

    old = _as_user("other-admin@test.com")
    try:
        db_session.add(User(id=uuid.uuid4(), email="other-admin@test.com", password_hash="hash"))
        db_session.commit()
        other_group_id = test_client.post("/api/v1/groups", json={"name": "Not Mine"}).json()["group_id"]
    finally:
        _restore(old)

    admin_id = _member_id(db_session, other_group_id, "other-admin@test.com")
    res = test_client.post(
        f"/api/v1/expenses/{expense.id}/move_to_group",
        json={"group_id": other_group_id, "split": {"type": "equal", "entries": [{"member_id": admin_id}]}},
    )
    assert res.status_code == 403


def test_already_group_expense_returns_400(test_client, db_session):
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    admin_id = _member_id(db_session, group_id, "test@user.com")
    created = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 30.00,
            "payers": [{"member_id": admin_id, "amount_paid": 30.00}],
            "split": {"type": "equal", "entries": [{"member_id": admin_id}]},
        },
    ).json()["expense"]

    res = test_client.post(
        f"/api/v1/expenses/{created['row_id']}/move_to_group",
        json={"group_id": group_id, "split": {"type": "equal", "entries": [{"member_id": admin_id}]}},
    )
    assert res.status_code == 400


def test_analytics_before_and_after_conversion(test_client, db_session):
    expense = _make_personal_expense(db_session, amount=100.0)
    db_session.add(User(id=uuid.uuid4(), email="friend@test.com", password_hash="hash"))
    db_session.commit()
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "friend@test.com"})
    admin_id = _member_id(db_session, group_id, "test@user.com")
    friend_id = _member_id(db_session, group_id, "friend@test.com")

    before = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 2}).json()
    assert before["total_expenses"] == 100.0

    test_client.post(
        f"/api/v1/expenses/{expense.id}/move_to_group",
        json={
            "group_id": group_id,
            "split": {"type": "equal", "entries": [{"member_id": admin_id}, {"member_id": friend_id}]},
        },
    )

    after_personal = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 2, "scope": "personal"}).json()
    assert after_personal["total_expenses"] == 0.0

    after_combined = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 2, "scope": "combined"}).json()
    assert after_combined["total_expenses"] == 50.0
