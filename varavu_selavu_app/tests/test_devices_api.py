import os
import uuid

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import DeviceToken
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
