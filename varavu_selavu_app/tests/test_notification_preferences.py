import os
import uuid
from unittest.mock import patch

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import DeviceToken, Group, GroupMember, User
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


def _make_group_with_member(test_client, db_session, other_email="member2@test.com"):
    db_session.add(User(id=uuid.uuid4(), email=other_email, password_hash="hash", name="Member Two"))
    db_session.commit()
    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": other_email})
    db_session.add(DeviceToken(id=uuid.uuid4(), user_email=other_email, expo_push_token="ExponentPushToken[abc]", platform="ios"))
    db_session.commit()
    return group_id


def test_default_preferences_are_notify_all(test_client, db_session):
    group_id = _make_group_with_member(test_client, db_session)
    res = test_client.get(f"/api/v1/groups/{group_id}/notification_preferences")
    assert res.status_code == 200
    assert res.json() == {"group_id": group_id, "muted": False, "muted_events": []}


def test_muting_group_suppresses_all_events(test_client, db_session):
    group_id = _make_group_with_member(test_client, db_session)

    old = _as_user("member2@test.com")
    try:
        res = test_client.put(f"/api/v1/groups/{group_id}/notification_preferences", json={"muted": True})
        assert res.status_code == 200
        assert res.json()["muted"] is True
    finally:
        _restore(old)

    with patch("varavu_selavu_service.services.notification_service.NotificationService._send_expo_push") as mock_send:
        test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026",
                "description": "Dinner",
                "category": "Food & Drink",
                "amount": 30.00,
                "payers": [{"member_id": _get_admin_member_id(db_session, group_id), "amount_paid": 30.00}],
                "split": {"type": "equal", "entries": [
                    {"member_id": _get_admin_member_id(db_session, group_id)},
                    {"member_id": _get_member_id(db_session, group_id, "member2@test.com")},
                ]},
            },
        )
        mock_send.assert_not_called()


def test_muting_one_event_type_still_delivers_others(test_client, db_session):
    group_id = _make_group_with_member(test_client, db_session)

    old = _as_user("member2@test.com")
    try:
        test_client.put(
            f"/api/v1/groups/{group_id}/notification_preferences",
            json={"muted_events": ["expense_added"]},
        )
    finally:
        _restore(old)

    admin_id = _get_admin_member_id(db_session, group_id)
    member2_id = _get_member_id(db_session, group_id, "member2@test.com")

    with patch("varavu_selavu_service.services.notification_service.NotificationService._send_expo_push") as mock_send:
        test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026",
                "description": "Dinner",
                "category": "Food & Drink",
                "amount": 30.00,
                "payers": [{"member_id": admin_id, "amount_paid": 30.00}],
                "split": {"type": "equal", "entries": [{"member_id": admin_id}, {"member_id": member2_id}]},
            },
        )
        mock_send.assert_not_called()

    with patch("varavu_selavu_service.services.notification_service.NotificationService._send_expo_push") as mock_send:
        test_client.post(
            f"/api/v1/groups/{group_id}/settlements",
            json={"from_member_id": member2_id, "to_member_id": admin_id, "amount": 15.00},
        )
        mock_send.assert_called_once()


def _get_admin_member_id(db_session, group_id):
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    m = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com").first()
    return str(m.id)


def _get_member_id(db_session, group_id, email):
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    m = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == email).first()
    return str(m.id)
