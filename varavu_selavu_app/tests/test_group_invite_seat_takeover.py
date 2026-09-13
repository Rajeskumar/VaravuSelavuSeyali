"""Regression tests for the invite seat-takeover escalation (security audit VS-01).

Before the fix, `create_invite` required only group *membership* and never checked whether
the target seat was occupied, while `accept_invite` reassigned the seat with
`member.user_email = acceptor_email` and left `role` untouched. An ordinary member could
therefore mint an invite for the group admin's live seat, redeem it from a second account,
inherit admin, and lock the real owner out of their own group along with their splits and
balance history.
"""

import os
import uuid

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import GroupMember, User
from varavu_selavu_service.main import app


@pytest.fixture(autouse=True)
def _groups_enabled():
    old = os.environ.get("GROUPS_ENABLED")
    os.environ["GROUPS_ENABLED"] = "true"
    try:
        yield
    finally:
        if old is not None:
            os.environ["GROUPS_ENABLED"] = old
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


def _seed(db_session, *emails):
    for e in emails:
        db_session.add(User(id=uuid.uuid4(), email=e, name=e, password_hash="!"))
    db_session.commit()


def test_member_cannot_mint_invite_for_the_admins_occupied_seat(test_client, db_session):
    """The core escalation: a plain member must not be able to put the admin's seat up for grabs."""
    _seed(db_session, "victim_admin@x.com", "attacker@x.com", "attacker_alt@x.com")

    old = _as_user("victim_admin@x.com")
    try:
        group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
        assert test_client.post(
            f"/api/v1/groups/{group_id}/members", json={"email": "attacker@x.com"}
        ).status_code == 201
    finally:
        _restore(old)

    admin_seat = (
        db_session.query(GroupMember)
        .filter(
            GroupMember.group_id == uuid.UUID(group_id),
            GroupMember.user_email == "victim_admin@x.com",
        )
        .first()
    )
    assert admin_seat.role == "admin"

    old = _as_user("attacker@x.com")
    try:
        res = test_client.post(
            f"/api/v1/groups/{group_id}/invites", json={"member_id": str(admin_seat.id)}
        )
    finally:
        _restore(old)

    assert res.status_code == 409

    db_session.expire_all()
    seat = db_session.query(GroupMember).filter(GroupMember.id == admin_seat.id).first()
    assert seat.user_email == "victim_admin@x.com"
    assert seat.role == "admin"

    # The owner still has access to their own group.
    old = _as_user("victim_admin@x.com")
    try:
        assert test_client.get(f"/api/v1/groups/{group_id}").status_code == 200
    finally:
        _restore(old)


def test_cannot_mint_invite_for_an_active_members_seat(test_client, db_session):
    """Same guard, applied to an ordinary member's seat rather than the admin's."""
    _seed(db_session, "owner2@x.com", "bystander@x.com", "attacker2@x.com")

    old = _as_user("owner2@x.com")
    try:
        group_id = test_client.post("/api/v1/groups", json={"name": "Flat"}).json()["group_id"]
        bystander = test_client.post(
            f"/api/v1/groups/{group_id}/members", json={"email": "bystander@x.com"}
        ).json()
        test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "attacker2@x.com"})
    finally:
        _restore(old)

    old = _as_user("attacker2@x.com")
    try:
        res = test_client.post(
            f"/api/v1/groups/{group_id}/invites", json={"member_id": bystander["member_id"]}
        )
    finally:
        _restore(old)

    assert res.status_code == 409

    db_session.expire_all()
    seat = (
        db_session.query(GroupMember)
        .filter(GroupMember.id == uuid.UUID(bystander["member_id"]))
        .first()
    )
    assert seat.user_email == "bystander@x.com"


def test_seat_claimed_after_invite_was_minted_cannot_be_redeemed(test_client, db_session):
    """Invites are long-lived, so the seat is re-checked at redemption, not only at mint time."""
    _seed(db_session, "owner3@x.com", "first@x.com", "second@x.com")

    old = _as_user("owner3@x.com")
    try:
        group_id = test_client.post("/api/v1/groups", json={"name": "Dinner"}).json()["group_id"]
        placeholder = test_client.post(
            f"/api/v1/groups/{group_id}/members", json={"display_name": "Guest"}
        ).json()
        token = test_client.post(
            f"/api/v1/groups/{group_id}/invites", json={"member_id": placeholder["member_id"]}
        ).json()["token"]
    finally:
        _restore(old)

    # First redeemer legitimately takes the seat.
    old = _as_user("first@x.com")
    try:
        assert test_client.post(
            "/api/v1/groups/invites/accept", json={"token": token}
        ).status_code == 200
    finally:
        _restore(old)

    # A second invite minted for that now-occupied seat is refused outright.
    old = _as_user("owner3@x.com")
    try:
        assert test_client.post(
            f"/api/v1/groups/{group_id}/invites", json={"member_id": placeholder["member_id"]}
        ).status_code == 409
    finally:
        _restore(old)

    db_session.expire_all()
    seat = (
        db_session.query(GroupMember)
        .filter(GroupMember.id == uuid.UUID(placeholder["member_id"]))
        .first()
    )
    assert seat.user_email == "first@x.com"


def test_placeholder_invite_flow_still_works(test_client, db_session):
    """The guards must not break the intended flow: a display_name-only seat stays invitable."""
    _seed(db_session, "owner4@x.com", "meera4@x.com")

    old = _as_user("owner4@x.com")
    try:
        group_id = test_client.post("/api/v1/groups", json={"name": "Goa"}).json()["group_id"]
        placeholder = test_client.post(
            f"/api/v1/groups/{group_id}/members", json={"display_name": "Meera"}
        ).json()
        invite = test_client.post(
            f"/api/v1/groups/{group_id}/invites", json={"member_id": placeholder["member_id"]}
        )
        assert invite.status_code == 201
    finally:
        _restore(old)

    old = _as_user("meera4@x.com")
    try:
        res = test_client.post("/api/v1/groups/invites/accept", json={"token": invite.json()["token"]})
    finally:
        _restore(old)

    assert res.status_code == 200
    db_session.expire_all()
    seat = (
        db_session.query(GroupMember)
        .filter(GroupMember.id == uuid.UUID(placeholder["member_id"]))
        .first()
    )
    assert seat.user_email == "meera4@x.com"
    assert seat.status == "active"
