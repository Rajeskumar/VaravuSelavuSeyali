import os
import uuid

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


def test_register_device_creates_row(test_client, db_session):
    res = test_client.post(
        "/api/v1/devices/register",
        json={"expo_push_token": "ExponentPushToken[abc123]", "platform": "ios"},
    )
    assert res.status_code == 200
    assert res.json() == {"success": True}

    row = db_session.query(DeviceToken).filter(DeviceToken.user_email == "test@user.com").first()
    assert row is not None
    assert row.expo_push_token == "ExponentPushToken[abc123]"
    assert row.platform == "ios"


def test_register_device_is_idempotent_upsert(test_client, db_session):
    payload = {"expo_push_token": "ExponentPushToken[dup]", "platform": "android"}
    first = test_client.post("/api/v1/devices/register", json=payload)
    second = test_client.post("/api/v1/devices/register", json=payload)
    assert first.status_code == 200
    assert second.status_code == 200

    rows = (
        db_session.query(DeviceToken)
        .filter(DeviceToken.user_email == "test@user.com", DeviceToken.expo_push_token == "ExponentPushToken[dup]")
        .all()
    )
    assert len(rows) == 1


def test_register_device_refreshes_last_seen_at(test_client, db_session):
    payload = {"expo_push_token": "ExponentPushToken[refresh]", "platform": "ios"}
    test_client.post("/api/v1/devices/register", json=payload)
    row = db_session.query(DeviceToken).filter(DeviceToken.expo_push_token == "ExponentPushToken[refresh]").first()
    first_seen = row.last_seen_at

    test_client.post("/api/v1/devices/register", json=payload)
    db_session.refresh(row)
    assert row.last_seen_at >= first_seen


def test_unregister_device_removes_row(test_client, db_session):
    payload = {"expo_push_token": "ExponentPushToken[gone]", "platform": "ios"}
    test_client.post("/api/v1/devices/register", json=payload)
    assert db_session.query(DeviceToken).filter(DeviceToken.expo_push_token == "ExponentPushToken[gone]").count() == 1

    res = test_client.request(
        "DELETE", "/api/v1/devices/register", params={"expo_push_token": "ExponentPushToken[gone]"}
    )
    assert res.status_code == 200
    assert res.json() == {"success": True}
    assert db_session.query(DeviceToken).filter(DeviceToken.expo_push_token == "ExponentPushToken[gone]").count() == 0


def test_unregister_unknown_token_is_a_no_op(test_client, db_session):
    res = test_client.request(
        "DELETE", "/api/v1/devices/register", params={"expo_push_token": "ExponentPushToken[never-existed]"}
    )
    assert res.status_code == 200
    assert res.json() == {"success": True}


def test_devices_routes_404_when_groups_disabled(test_client):
    os.environ["GROUPS_ENABLED"] = "false"
    try:
        res = test_client.post(
            "/api/v1/devices/register", json={"expo_push_token": "ExponentPushToken[x]", "platform": "ios"}
        )
        assert res.status_code == 404
    finally:
        os.environ["GROUPS_ENABLED"] = "true"


def _register_as(email: str, token: str, platform: str = "ios"):
    old = app.dependency_overrides.get(auth_required)
    app.dependency_overrides[auth_required] = lambda: email
    try:
        from fastapi.testclient import TestClient

        return TestClient(app).post("/api/v1/devices/register", json={"expo_push_token": token, "platform": platform})
    finally:
        if old is not None:
            app.dependency_overrides[auth_required] = old


def _owners(db_session, token: str):
    db_session.expire_all()
    return sorted(r.user_email for r in db_session.query(DeviceToken).filter(DeviceToken.expo_push_token == token).all())


def test_registering_a_device_takes_it_from_the_previous_account(db_session):
    """A push token is one physical device. After A is signed out without a clean unregister (forced sign-out, offline,
    lost reply) and B signs in on it, A's notifications must not keep arriving on B's device."""
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()
    shared = "ExponentPushToken[shared-device]"
    assert _register_as("test@user.com", shared).status_code == 200
    assert _owners(db_session, shared) == ["test@user.com"]

    assert _register_as("other@user.com", shared).status_code == 200
    assert _owners(db_session, shared) == ["other@user.com"]


def test_registering_a_device_leaves_the_accounts_other_devices_and_other_tokens_alone(db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()
    _register_as("test@user.com", "ExponentPushToken[phone]")
    _register_as("test@user.com", "ExponentPushToken[tablet]", "android")
    _register_as("other@user.com", "ExponentPushToken[other-phone]")
    assert _owners(db_session, "ExponentPushToken[phone]") == ["test@user.com"]
    assert _owners(db_session, "ExponentPushToken[tablet]") == ["test@user.com"]
    assert _owners(db_session, "ExponentPushToken[other-phone]") == ["other@user.com"]


@pytest.mark.parametrize("token", ["x", "", "ExponentPushToken[]", "ExponentPushToken[a b]", "Bearer abc", "ExponentPushToken[" + "a" * 300 + "]"])
def test_register_device_rejects_malformed_tokens(test_client, token):
    res = test_client.post("/api/v1/devices/register", json={"expo_push_token": token, "platform": "ios"})
    assert res.status_code == 422


def test_register_device_accepts_both_expo_token_prefixes(test_client, db_session):
    for token in ("ExponentPushToken[abc-DEF_123]", "ExpoPushToken[abc-DEF_123]"):
        assert test_client.post("/api/v1/devices/register", json={"expo_push_token": token, "platform": "android"}).status_code == 200


@pytest.mark.parametrize("platform", ["web", "", "IOS", "windows"])
def test_register_device_rejects_unknown_platforms(test_client, platform):
    res = test_client.post("/api/v1/devices/register", json={"expo_push_token": "ExponentPushToken[ok]", "platform": platform})
    assert res.status_code == 422


def test_register_device_is_rate_limited_per_client(test_client, db_session):
    codes = [
        test_client.post("/api/v1/devices/register", json={"expo_push_token": f"ExponentPushToken[t{i}]", "platform": "ios"}).status_code
        for i in range(70)
    ]
    assert codes[:60] == [200] * 60
    assert 429 in codes[60:]
