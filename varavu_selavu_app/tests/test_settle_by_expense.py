import os
import uuid

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import ExpenseSplit, Group, GroupMember, Settlement, User
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


def _make_group_with_expense(test_client, db_session, other_email="member2@test.com"):
    db_session.add(User(id=uuid.uuid4(), email=other_email, password_hash="hash", name="Member Two"))
    db_session.commit()
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": other_email})

    admin_id = _member_id(db_session, group_id, "test@user.com")
    member_id = _member_id(db_session, group_id, other_email)

    exp_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 100.00,
            "payers": [{"member_id": admin_id, "amount_paid": 100.00}],
            "split": {"type": "equal", "entries": [{"member_id": admin_id}, {"member_id": member_id}]},
        },
    )
    expense_id = exp_res.json()["expense"]["row_id"]
    return group_id, expense_id, admin_id, member_id


def test_settle_share_creates_settlement_and_marks_split(test_client, db_session):
    group_id, expense_id, admin_id, member_id = _make_group_with_expense(test_client, db_session)

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses/{expense_id}/settle_share",
        json={"member_id": member_id},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["from_member_id"] == member_id
    assert body["to_member_id"] == admin_id
    assert body["amount"] == 50.0

    split = db_session.query(ExpenseSplit).filter(
        ExpenseSplit.expense_id == uuid.UUID(expense_id), ExpenseSplit.member_id == uuid.UUID(member_id)
    ).first()
    assert split.settled_via_settlement_id is not None

    balances = test_client.get(f"/api/v1/groups/{group_id}/balances").json()
    nets = {m["member_id"]: m["net"] for m in balances["members"]}
    assert nets[admin_id] == 0.0
    assert nets[member_id] == 0.0


def test_double_settle_same_share_conflicts(test_client, db_session):
    group_id, expense_id, admin_id, member_id = _make_group_with_expense(test_client, db_session)
    test_client.post(f"/api/v1/groups/{group_id}/expenses/{expense_id}/settle_share", json={"member_id": member_id})
    res = test_client.post(f"/api/v1/groups/{group_id}/expenses/{expense_id}/settle_share", json={"member_id": member_id})
    assert res.status_code == 409


def test_undo_settlement_reverts_split_to_unsettled(test_client, db_session):
    group_id, expense_id, admin_id, member_id = _make_group_with_expense(test_client, db_session)
    settlement_id = test_client.post(
        f"/api/v1/groups/{group_id}/expenses/{expense_id}/settle_share", json={"member_id": member_id}
    ).json()["id"]

    res = test_client.delete(f"/api/v1/groups/{group_id}/settlements/{settlement_id}")
    assert res.status_code == 200

    split = db_session.query(ExpenseSplit).filter(
        ExpenseSplit.expense_id == uuid.UUID(expense_id), ExpenseSplit.member_id == uuid.UUID(member_id)
    ).first()
    assert split.settled_via_settlement_id is None
