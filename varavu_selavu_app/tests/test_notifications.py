import os
import uuid
from unittest.mock import MagicMock, patch

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import DeviceToken, User
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


def _ok_expo_response(n_messages: int):
    """A successful Expo /send response: one "ok" ticket per message."""
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"data": [{"status": "ok", "id": f"ticket-{i}"} for i in range(n_messages)]}
    return resp


def _make_group_with_members(test_client, db_session, other_emails):
    """test@user.com (default auth override) is the admin/creator. Returns (group_id, {email: member_id})."""
    for email in other_emails:
        db_session.add(User(id=uuid.uuid4(), email=email, password_hash="hash", name=email.split("@")[0]))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    from varavu_selavu_service.db.models import Group, GroupMember

    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    member_ids = {}
    admin_member = (
        db_session.query(GroupMember)
        .filter(GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com")
        .first()
    )
    member_ids["test@user.com"] = str(admin_member.id)

    for email in other_emails:
        res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": email})
        member_ids[email] = res.json()["member_id"]

    return group_id, member_ids


def _register_token(db_session, email, token):
    db_session.add(DeviceToken(id=uuid.uuid4(), user_email=email, expo_push_token=token, platform="ios"))
    db_session.commit()


@patch("varavu_selavu_service.services.notification_service.requests.post")
def test_expense_added_notifies_all_members_except_actor(mock_post, test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])
    _register_token(db_session, "test@user.com", "tok-admin")  # actor — must never receive a push
    _register_token(db_session, "b@test.com", "tok-b")
    _register_token(db_session, "c@test.com", "tok-c")
    mock_post.return_value = _ok_expo_response(2)

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    assert res.status_code == 201

    assert mock_post.call_count == 1
    sent_messages = mock_post.call_args.kwargs["json"]
    recipients = {msg["to"] for msg in sent_messages}
    assert recipients == {"tok-b", "tok-c"}  # never tok-admin — the actor
    for msg in sent_messages:
        assert "your share is $30.00" in msg["body"]
        assert msg["data"]["group_id"] == group_id


@patch("varavu_selavu_service.services.notification_service.requests.post")
def test_expense_edited_includes_share_delta_only_when_changed(mock_post, test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])
    _register_token(db_session, "b@test.com", "tok-b")
    mock_post.return_value = _ok_expo_response(1)

    create_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    expense_id = create_res.json()["expense"]["row_id"]
    mock_post.reset_mock()

    # Same amount, same members — every member's share is unchanged (still $30 each).
    same_amount_res = test_client.put(
        f"/api/v1/groups/{group_id}/expenses/{expense_id}",
        json={
            "date": "01/15/2026",
            "description": "Dinner (renamed)",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    assert same_amount_res.status_code == 200
    body_no_delta = mock_post.call_args.kwargs["json"][0]["body"]
    assert "→" not in body_no_delta
    assert "Dinner (renamed)" in body_no_delta

    mock_post.reset_mock()
    mock_post.return_value = _ok_expo_response(1)

    # Amount increases — every member's share changes from $30.00 to $40.00.
    changed_amount_res = test_client.put(
        f"/api/v1/groups/{group_id}/expenses/{expense_id}",
        json={
            "date": "01/15/2026",
            "description": "Dinner (renamed)",
            "category": "Food & Drink",
            "amount": 120.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 120.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    assert changed_amount_res.status_code == 200
    body_with_delta = mock_post.call_args.kwargs["json"][0]["body"]
    assert "$30.00 → $40.00" in body_with_delta


@patch("varavu_selavu_service.services.notification_service.requests.post")
def test_expense_deleted_notifies_members(mock_post, test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    _register_token(db_session, "b@test.com", "tok-b")
    mock_post.return_value = _ok_expo_response(1)

    create_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Groceries",
            "category": "Food & Drink",
            "amount": 50.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 50.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    expense_id = create_res.json()["expense"]["row_id"]
    mock_post.reset_mock()
    mock_post.return_value = _ok_expo_response(1)

    delete_res = test_client.delete(f"/api/v1/groups/{group_id}/expenses/{expense_id}")
    assert delete_res.status_code == 200

    assert mock_post.call_count == 1
    body = mock_post.call_args.kwargs["json"][0]["body"]
    assert "Groceries" in body
    assert "deleted" in body


@patch("varavu_selavu_service.services.notification_service.requests.post")
def test_settlement_recorded_personalizes_paid_you_message(mock_post, test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])
    _register_token(db_session, "b@test.com", "tok-b")
    _register_token(db_session, "c@test.com", "tok-c")
    mock_post.return_value = _ok_expo_response(2)

    # Admin (actor) records that b paid c $25.
    res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": m["b@test.com"], "to_member_id": m["c@test.com"], "amount": 25.0},
    )
    assert res.status_code == 201

    sent_messages = {msg["to"]: msg["body"] for msg in mock_post.call_args.kwargs["json"]}
    assert "paid you $25.00" in sent_messages["tok-c"]
    assert "paid you" not in sent_messages["tok-b"]
    assert "$25.00" in sent_messages["tok-b"]


@patch("varavu_selavu_service.services.notification_service.requests.post")
def test_member_joined_excludes_actor_and_new_member(mock_post, test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    _register_token(db_session, "b@test.com", "tok-b")
    db_session.add(User(id=uuid.uuid4(), email="d@test.com", password_hash="hash", name="d"))
    db_session.commit()
    _register_token(db_session, "d@test.com", "tok-d")  # the new joiner — must not be notified about themselves
    mock_post.return_value = _ok_expo_response(1)

    res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "d@test.com"})
    assert res.status_code == 201

    assert mock_post.call_count == 1
    sent_messages = mock_post.call_args.kwargs["json"]
    recipients = {msg["to"] for msg in sent_messages}
    assert recipients == {"tok-b"}
    assert "joined Trip" in sent_messages[0]["body"]


@patch("varavu_selavu_service.services.notification_service.requests.post")
def test_expo_send_failure_does_not_raise_into_the_route(mock_post, test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    _register_token(db_session, "b@test.com", "tok-b")
    mock_post.side_effect = Exception("Expo is down")

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    assert res.status_code == 201  # the group-expense creation itself must still succeed


@patch("varavu_selavu_service.services.notification_service.requests.post")
def test_invalid_token_pruned_after_device_not_registered_error(mock_post, test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    _register_token(db_session, "b@test.com", "tok-stale")

    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {
        "data": [{"status": "error", "message": "not registered", "details": {"error": "DeviceNotRegistered"}}]
    }
    mock_post.return_value = resp

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    assert res.status_code == 201

    assert db_session.query(DeviceToken).filter(DeviceToken.expo_push_token == "tok-stale").first() is None


@patch("varavu_selavu_service.services.notification_service.requests.post")
def test_no_push_attempted_when_no_recipients_have_tokens(mock_post, test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    # Nobody has registered a device token.
    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    assert res.status_code == 201
    mock_post.assert_not_called()
