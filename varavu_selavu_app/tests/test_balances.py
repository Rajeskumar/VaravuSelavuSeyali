import os
import uuid

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


def _make_group_with_members(test_client, db_session, other_emails):
    """test@user.com (default auth override) is the admin/creator. Returns (group_id, {email: member_id})."""
    for email in other_emails:
        db_session.add(User(id=uuid.uuid4(), email=email, password_hash="hash", name=email.split("@")[0]))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    member_ids = {}
    admin_member = db_session.query(GroupMember).filter(
        GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com"
    ).first()
    member_ids["test@user.com"] = str(admin_member.id)

    for email in other_emails:
        res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": email})
        member_ids[email] = res.json()["member_id"]

    return group_id, member_ids


def test_scripted_scenario_net_balances_and_zero_sum(test_client, db_session):
    """A pays 90, split equal among A/B/C (30 each). B settles 20 to A.

    Expected net(m) = paid - owed + sent - received:
      A: 90 - 30 + 0 - 20 = 40
      B:  0 - 30 + 20 - 0 = -10
      C:  0 - 30 +  0 - 0 = -30
      sum = 0
    """
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])

    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )

    settle_res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": m["b@test.com"], "to_member_id": m["test@user.com"], "amount": 20.00},
    )
    assert settle_res.status_code == 201

    res = test_client.get(f"/api/v1/groups/{group_id}/balances")
    assert res.status_code == 200
    body = res.json()
    assert body["simplified"] is False

    nets = {row["member_id"]: row["net"] for row in body["members"]}
    assert nets[m["test@user.com"]] == 40.00
    assert nets[m["b@test.com"]] == -10.00
    assert nets[m["c@test.com"]] == -30.00
    assert round(sum(nets.values()), 2) == 0.0


def test_balance_changes_after_edit_settlement_untouched(test_client, db_session):
    """E2: expense edited after a settlement is allowed; balances recompute; the
    settlement row itself is never auto-modified."""
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])

    create_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    expense_id = create_res.json()["expense"]["row_id"]

    settle_res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": m["b@test.com"], "to_member_id": m["test@user.com"], "amount": 20.00},
    )
    settlement_id = settle_res.json()["id"]

    before = test_client.get(f"/api/v1/groups/{group_id}/balances").json()
    nets_before = {row["member_id"]: row["net"] for row in before["members"]}
    assert nets_before[m["test@user.com"]] == 40.00

    # A different member edits the expense amount down to 60 (still equal 3-way = 20 each).
    old = _as_user("c@test.com")
    try:
        edit_res = test_client.put(
            f"/api/v1/groups/{group_id}/expenses/{expense_id}",
            json={
                "date": "01/15/2026",
                "description": "Dinner",
                "category": "Food",
                "amount": 60.00,
                "payers": [{"member_id": m["test@user.com"], "amount_paid": 60.00}],
                "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
            },
        )
    finally:
        _restore(old)
    assert edit_res.status_code == 200

    after = test_client.get(f"/api/v1/groups/{group_id}/balances").json()
    nets_after = {row["member_id"]: row["net"] for row in after["members"]}
    # New raw net for A = 60 - 20 = 40, minus the still-applying 20 settlement = 20.
    assert nets_after[m["test@user.com"]] == 20.00
    assert nets_after != nets_before
    assert round(sum(nets_after.values()), 2) == 0.0

    # The settlement itself was never touched by the edit.
    settlement = db_session.query(Settlement).filter(Settlement.id == uuid.UUID(settlement_id)).first()
    assert settlement is not None
    assert float(settlement.amount) == 20.00


def test_balances_non_member_returns_403(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    old = _as_user("outsider@test.com")
    try:
        res = test_client.get(f"/api/v1/groups/{group_id}/balances")
    finally:
        _restore(old)
    assert res.status_code == 403


def test_leave_allowed_when_net_balance_is_zero_despite_activity(test_client, db_session):
    """TS-GRP-102's leave/remove guard now uses BalanceService.member_net, not the old
    'any activity exists' interim proxy. A member who paid exactly their own share has
    plenty of ExpensePayer/ExpenseSplit rows but a net balance of zero, and must be
    able to leave without force."""
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    # b@test.com pays for and owns their own $20 lunch (paid == owed -> net 0).
    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Solo lunch",
            "category": "Food",
            "amount": 20.00,
            "payers": [{"member_id": m["b@test.com"], "amount_paid": 20.00}],
            "split": {"type": "equal", "entries": [{"member_id": m["b@test.com"]}]},
        },
    )

    old = _as_user("b@test.com")
    try:
        res = test_client.post(f"/api/v1/groups/{group_id}/leave")
    finally:
        _restore(old)

    assert res.status_code == 200
    member = db_session.query(GroupMember).filter(GroupMember.id == uuid.UUID(m["b@test.com"])).first()
    assert member.status == "left"
