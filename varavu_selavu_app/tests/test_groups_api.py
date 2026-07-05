import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import (
    Expense, ExpensePayer, ExpenseSplit, Group, GroupInvitation, GroupMember, User
)
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
    """Temporarily overrides auth_required to simulate a different caller."""
    old = app.dependency_overrides.get(auth_required)
    app.dependency_overrides[auth_required] = lambda: email
    return old


def _restore(old):
    if old is not None:
        app.dependency_overrides[auth_required] = old
    else:
        app.dependency_overrides.pop(auth_required, None)


def test_groups_routes_hidden_when_flag_disabled(test_client, db_session):
    old_val = os.environ.get("GROUPS_ENABLED")
    os.environ["GROUPS_ENABLED"] = "false"
    try:
        res = test_client.post("/api/v1/groups", json={"name": "Test"})
        assert res.status_code == 404
    finally:
        if old_val is not None:
            os.environ["GROUPS_ENABLED"] = old_val
        else:
            os.environ.pop("GROUPS_ENABLED", None)


def test_create_group_creator_is_admin_member(test_client, db_session):
    res = test_client.post("/api/v1/groups", json={"name": "Apartment 4B", "group_type": "home"})
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Apartment 4B"
    assert body["group_type"] == "home"
    assert body["member_count"] == 1
    assert body["my_balance"] == 0.0

    group = db_session.query(Group).filter(Group.id == uuid.UUID(body["group_id"])).first()
    assert group is not None
    assert group.created_by == "test@user.com"

    member = db_session.query(GroupMember).filter(GroupMember.group_id == group.id).first()
    assert member.user_email == "test@user.com"
    assert member.role == "admin"
    assert member.status == "active"


def test_add_registered_member_links_instantly(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="arun@test.com", password_hash="hash", name="Arun"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "arun@test.com"})
    assert res.status_code == 201
    body = res.json()
    assert body["user_email"] == "arun@test.com"
    assert body["status"] == "active"
    assert body["display_name"] == "Arun"


def test_add_member_with_unregistered_email_is_rejected(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "nobody@nowhere.com"})
    assert res.status_code == 400


def test_add_placeholder_member_has_no_user_email_until_invite_accepted(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"display_name": "Meera"})
    assert res.status_code == 201
    body = res.json()
    assert body["user_email"] is None
    assert body["status"] == "invited"
    assert body["display_name"] == "Meera"

    member = db_session.query(GroupMember).filter(GroupMember.id == uuid.UUID(body["member_id"])).first()
    assert member.user_email is None


def test_invite_create_and_accept_happy_path(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="meera@test.com", password_hash="hash", name="Meera"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"display_name": "Meera"})
    member_id = member_res.json()["member_id"]

    invite_res = test_client.post(f"/api/v1/groups/{group_id}/invites", json={"member_id": member_id})
    assert invite_res.status_code == 201
    invite_body = invite_res.json()
    assert "token" in invite_body
    assert invite_body["url"].endswith(f"/groups/join/{invite_body['token']}")

    old = _as_user("meera@test.com")
    try:
        accept_res = test_client.post("/api/v1/groups/invites/accept", json={"token": invite_body["token"]})
    finally:
        _restore(old)

    assert accept_res.status_code == 200
    accept_body = accept_res.json()
    assert accept_body["member_id"] == member_id
    assert accept_body["group_id"] == group_id

    member = db_session.query(GroupMember).filter(GroupMember.id == uuid.UUID(member_id)).first()
    assert member.user_email == "meera@test.com"
    assert member.status == "active"
    assert member.joined_at is not None


def test_expired_invite_token_returns_410(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="meera2@test.com", password_hash="hash", name="Meera"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"display_name": "Meera"})
    member_id = member_res.json()["member_id"]

    invite_res = test_client.post(f"/api/v1/groups/{group_id}/invites", json={"member_id": member_id})
    token = invite_res.json()["token"]

    invite = db_session.query(GroupInvitation).filter(GroupInvitation.token == token).first()
    invite.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()

    old = _as_user("meera2@test.com")
    try:
        res = test_client.post("/api/v1/groups/invites/accept", json={"token": token})
    finally:
        _restore(old)
    assert res.status_code == 410


def test_accept_invite_by_existing_member_email_returns_409(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"display_name": "Placeholder"})
    member_id = member_res.json()["member_id"]

    invite_res = test_client.post(f"/api/v1/groups/{group_id}/invites", json={"member_id": member_id})
    token = invite_res.json()["token"]

    # "test@user.com" (default override) is already the admin/creator of this group.
    res = test_client.post("/api/v1/groups/invites/accept", json={"token": token})
    assert res.status_code == 409


def test_non_member_access_returns_403(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    old = _as_user("outsider@test.com")
    try:
        res = test_client.get(f"/api/v1/groups/{group_id}")
    finally:
        _restore(old)
    assert res.status_code == 403


def test_non_admin_put_and_delete_return_403(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="member2@test.com", password_hash="hash", name="Member Two"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "member2@test.com"})

    old = _as_user("member2@test.com")
    try:
        put_res = test_client.put(f"/api/v1/groups/{group_id}", json={"name": "Renamed"})
        delete_res = test_client.delete(f"/api/v1/groups/{group_id}")
    finally:
        _restore(old)

    assert put_res.status_code == 403
    assert delete_res.status_code == 403


def test_admin_soft_delete_sets_status_deleted(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    res = test_client.delete(f"/api/v1/groups/{group_id}")
    assert res.status_code == 200

    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    assert group.status == "deleted"


def test_leave_blocked_with_activity_and_allowed_when_clear(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="member3@test.com", password_hash="hash", name="Member Three"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "member3@test.com"})
    member_id = member_res.json()["member_id"]

    # Give this member a split against a group expense (bypassing TS-GRP-104, not yet built).
    expense = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        group_id=uuid.UUID(group_id),
        split_type="equal",
        category_id="Food",
        amount=50.0,
    )
    db_session.add(expense)
    db_session.commit()
    split = ExpenseSplit(expense_id=expense.id, member_id=uuid.UUID(member_id), amount_owed=25.0, basis_type="equal")
    db_session.add(split)
    db_session.commit()

    old = _as_user("member3@test.com")
    try:
        blocked = test_client.post(f"/api/v1/groups/{group_id}/leave")
    finally:
        _restore(old)
    assert blocked.status_code == 409

    # Clear the activity, then leaving should succeed.
    db_session.delete(split)
    db_session.commit()

    old = _as_user("member3@test.com")
    try:
        ok = test_client.post(f"/api/v1/groups/{group_id}/leave")
    finally:
        _restore(old)
    assert ok.status_code == 200

    member = db_session.query(GroupMember).filter(GroupMember.id == uuid.UUID(member_id)).first()
    assert member.status == "left"


def test_remove_member_requires_force_with_activity(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="member4@test.com", password_hash="hash", name="Member Four"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "member4@test.com"})
    member_id = member_res.json()["member_id"]

    expense = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        group_id=uuid.UUID(group_id),
        split_type="equal",
        category_id="Food",
        amount=50.0,
    )
    db_session.add(expense)
    db_session.commit()
    payer = ExpensePayer(expense_id=expense.id, member_id=uuid.UUID(member_id), amount_paid=50.0)
    db_session.add(payer)
    db_session.commit()

    blocked = test_client.delete(f"/api/v1/groups/{group_id}/members/{member_id}")
    assert blocked.status_code == 409

    forced = test_client.delete(f"/api/v1/groups/{group_id}/members/{member_id}", params={"force": "true"})
    assert forced.status_code == 200

    member = db_session.query(GroupMember).filter(GroupMember.id == uuid.UUID(member_id)).first()
    assert member.status == "left"
    # Balance rows are untouched by removal (E1: "their splits/settlements remain").
    assert db_session.query(ExpensePayer).filter(ExpensePayer.member_id == uuid.UUID(member_id)).first() is not None
