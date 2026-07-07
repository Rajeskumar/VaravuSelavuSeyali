import os
import uuid
from datetime import datetime

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import Group, GroupMember, Settlement, User
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


def _make_group_with_two_members(test_client, db_session, second_email="member2@test.com"):
    """test@user.com (the default auth override) is the admin/creator."""
    db_session.add(User(id=uuid.uuid4(), email=second_email, password_hash="hash", name="Member Two"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    admin_member = db_session.query(GroupMember).filter(
        GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com"
    ).first()

    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": second_email})
    member2_id = member_res.json()["member_id"]

    return group_id, str(admin_member.id), member2_id


def test_record_settlement_happy_path(test_client, db_session):
    group_id, admin_id, member2_id = _make_group_with_two_members(test_client, db_session)

    res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": member2_id, "to_member_id": admin_id, "amount": 42.17, "method": "cash"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["group_id"] == group_id
    assert body["from_member_id"] == member2_id
    assert body["to_member_id"] == admin_id
    assert body["amount"] == 42.17
    assert body["method"] == "cash"
    assert body["created_by"] == "test@user.com"

    row = db_session.query(Settlement).filter(Settlement.id == uuid.UUID(body["id"])).first()
    assert row is not None
    assert float(row.amount) == 42.17
    assert row.from_member_id != row.to_member_id


def test_settlement_from_equals_to_returns_400(test_client, db_session):
    group_id, admin_id, _member2_id = _make_group_with_two_members(test_client, db_session)

    res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": admin_id, "to_member_id": admin_id, "amount": 10.0},
    )
    assert res.status_code == 400


def test_settlement_amount_must_be_positive(test_client, db_session):
    group_id, admin_id, member2_id = _make_group_with_two_members(test_client, db_session)

    res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": member2_id, "to_member_id": admin_id, "amount": 0},
    )
    assert res.status_code == 400


def test_member_not_in_group_returns_400(test_client, db_session):
    group_id, admin_id, _member2_id = _make_group_with_two_members(test_client, db_session)

    other_group_res = test_client.post("/api/v1/groups", json={"name": "Other Group"})
    other_group_id = other_group_res.json()["group_id"]
    other_group = db_session.query(Group).filter(Group.id == uuid.UUID(other_group_id)).first()
    outsider_member = db_session.query(GroupMember).filter(GroupMember.group_id == other_group.id).first()

    res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": str(outsider_member.id), "to_member_id": admin_id, "amount": 10.0},
    )
    assert res.status_code == 400


def test_non_member_caller_returns_403(test_client, db_session):
    group_id, admin_id, member2_id = _make_group_with_two_members(test_client, db_session)

    old = _as_user("outsider@test.com")
    try:
        create_res = test_client.post(
            f"/api/v1/groups/{group_id}/settlements",
            json={"from_member_id": member2_id, "to_member_id": admin_id, "amount": 10.0},
        )
        list_res = test_client.get(f"/api/v1/groups/{group_id}/settlements")
    finally:
        _restore(old)

    assert create_res.status_code == 403
    assert list_res.status_code == 403


def test_partial_payment_amount_accepted(test_client, db_session):
    group_id, admin_id, member2_id = _make_group_with_two_members(test_client, db_session)

    # No real balance exists yet (BalanceService lands in TS-GRP-104) — any positive
    # amount, including one smaller than any hypothetical owed balance, is accepted.
    res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": member2_id, "to_member_id": admin_id, "amount": 5.00},
    )
    assert res.status_code == 201
    assert res.json()["amount"] == 5.00


def test_list_settlements_ordered_most_recent_first(test_client, db_session):
    group_id, admin_id, member2_id = _make_group_with_two_members(test_client, db_session)

    first = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={
            "from_member_id": member2_id,
            "to_member_id": admin_id,
            "amount": 10.0,
            "settled_at": "2026-01-01T00:00:00Z",
        },
    )
    second = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={
            "from_member_id": member2_id,
            "to_member_id": admin_id,
            "amount": 20.0,
            "settled_at": "2026-02-01T00:00:00Z",
        },
    )
    assert first.status_code == 201
    assert second.status_code == 201

    res = test_client.get(f"/api/v1/groups/{group_id}/settlements")
    assert res.status_code == 200
    amounts = [row["amount"] for row in res.json()]
    assert amounts == [20.0, 10.0]


def test_undo_settlement_removes_it(test_client, db_session):
    group_id, admin_id, member2_id = _make_group_with_two_members(test_client, db_session)

    create_res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": member2_id, "to_member_id": admin_id, "amount": 15.0},
    )
    settlement_id = create_res.json()["id"]

    delete_res = test_client.delete(f"/api/v1/groups/{group_id}/settlements/{settlement_id}")
    assert delete_res.status_code == 200

    assert db_session.query(Settlement).filter(Settlement.id == uuid.UUID(settlement_id)).first() is None

    list_res = test_client.get(f"/api/v1/groups/{group_id}/settlements")
    assert list_res.json() == []


def test_settlement_does_not_affect_spend_analytics(test_client, db_session):
    """Settlements are not spend in any view (spec rule TS-GRP-R2)."""
    from varavu_selavu_service.db.models import Expense
    from varavu_selavu_service.services.analysis_service import AnalysisService

    db_session.add(Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        purchased_at=datetime(2024, 1, 1),
        category_id="Food",
        amount=25.0,
        description="Groceries",
    ))
    db_session.commit()

    # AnalysisService's cache is a process-wide class attribute (not reset between
    # tests) — invalidate first so "before" reflects this test's DB, not a stale
    # entry left by an earlier test hitting the same (user, year, month) key.
    AnalysisService(db_session).invalidate_cache()

    before = test_client.get("/api/v1/analysis", params={"year": 2024, "month": 1})
    assert before.status_code == 200
    total_before = before.json()["total_expenses"]
    assert total_before == 25.0

    group_id, admin_id, member2_id = _make_group_with_two_members(test_client, db_session)
    settle_res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": member2_id, "to_member_id": admin_id, "amount": 42.17},
    )
    assert settle_res.status_code == 201

    after = test_client.get("/api/v1/analysis", params={"year": 2024, "month": 1})
    assert after.status_code == 200
    total_after = after.json()["total_expenses"]

    assert total_after == total_before == 25.0

    # And no expense row was created for the settlement itself.
    assert db_session.query(Expense).filter(Expense.amount == 42.17).first() is None
