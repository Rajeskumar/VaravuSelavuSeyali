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


def _member_id(db_session, group_id, email):
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    m = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == email).first()
    return str(m.id)


def _add_equal_expense(test_client, group_id, amount, payer_id, participant_ids):
    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Shared cost",
            "category": "Food & Drink",
            "amount": amount,
            "payers": [{"member_id": payer_id, "amount_paid": amount}],
            "split": {"type": "equal", "entries": [{"member_id": pid} for pid in participant_ids]},
        },
    )


def test_aggregates_same_friend_across_two_groups(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="friend@test.com", password_hash="hash", name="Friend"))
    db_session.commit()

    g1 = test_client.post("/api/v1/groups", json={"name": "Apartment"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{g1}/members", json={"email": "friend@test.com"})
    g2 = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{g2}/members", json={"email": "friend@test.com"})

    admin1, friend1 = _member_id(db_session, g1, "test@user.com"), _member_id(db_session, g1, "friend@test.com")
    admin2, friend2 = _member_id(db_session, g2, "test@user.com"), _member_id(db_session, g2, "friend@test.com")

    # I paid $100 in group 1, split equally -> friend owes me $50.
    _add_equal_expense(test_client, g1, 100.0, admin1, [admin1, friend1])
    # I paid $40 in group 2, split equally -> friend owes me $20.
    _add_equal_expense(test_client, g2, 40.0, admin2, [admin2, friend2])

    res = test_client.get("/api/v1/friends/balances")
    assert res.status_code == 200
    balances = res.json()["balances"]
    assert len(balances) == 1
    entry = balances[0]
    assert entry["counterparty_email"] == "friend@test.com"
    assert entry["net"] == 70.0
    assert {g["net"] for g in entry["groups"]} == {50.0, 20.0}


def test_placeholder_members_are_not_aggregated_across_groups(test_client, db_session):
    g1 = test_client.post("/api/v1/groups", json={"name": "Apartment"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{g1}/members", json={"display_name": "Roommate"})
    g2 = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{g2}/members", json={"display_name": "Roommate"})

    admin1 = _member_id(db_session, g1, "test@user.com")
    placeholder1 = [m for m in db_session.query(GroupMember).filter(GroupMember.group_id == uuid.UUID(g1)).all() if m.user_email is None][0]
    admin2 = _member_id(db_session, g2, "test@user.com")
    placeholder2 = [m for m in db_session.query(GroupMember).filter(GroupMember.group_id == uuid.UUID(g2)).all() if m.user_email is None][0]

    _add_equal_expense(test_client, g1, 50.0, admin1, [admin1, str(placeholder1.id)])
    _add_equal_expense(test_client, g2, 30.0, admin2, [admin2, str(placeholder2.id)])

    res = test_client.get("/api/v1/friends/balances")
    balances = res.json()["balances"]
    # Two separate placeholder entries, never merged (no counterparty_email to key on).
    assert len(balances) == 2
    assert all(b["counterparty_email"] is None for b in balances)
    assert {b["net"] for b in balances} == {25.0, 15.0}
