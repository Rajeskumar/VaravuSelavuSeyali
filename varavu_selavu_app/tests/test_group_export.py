import csv
import io
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


def _as_user(email: str):
    old = app.dependency_overrides.get(auth_required)
    app.dependency_overrides[auth_required] = lambda: email
    return old


def _restore(old):
    if old is not None:
        app.dependency_overrides[auth_required] = old
    else:
        app.dependency_overrides.pop(auth_required, None)


def _member_id(db_session, group_id, email):
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    m = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == email).first()
    return str(m.id)


def test_export_includes_expenses_and_settlements(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="friend@test.com", password_hash="hash", name="Friend"))
    db_session.commit()
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "friend@test.com"})

    admin_id = _member_id(db_session, group_id, "test@user.com")
    friend_id = _member_id(db_session, group_id, "friend@test.com")

    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 60.00,
            "payers": [{"member_id": admin_id, "amount_paid": 60.00}],
            "split": {"type": "equal", "entries": [{"member_id": admin_id}, {"member_id": friend_id}]},
        },
    )
    test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": friend_id, "to_member_id": admin_id, "amount": 30.00},
    )

    res = test_client.get(f"/api/v1/groups/{group_id}/export.csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")

    text = res.text.lstrip("﻿")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0][0] == "record_type"
    record_types = [r[0] for r in rows[1:]]
    assert record_types == ["expense", "settlement"]
    assert "Dinner" in rows[1]
    assert "Friend" in rows[2] or "friend" in rows[2][6].lower()


def test_non_member_cannot_export(test_client, db_session):
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    db_session.add(User(id=uuid.uuid4(), email="stranger@test.com", password_hash="hash"))
    db_session.commit()
    old = _as_user("stranger@test.com")
    try:
        res = test_client.get(f"/api/v1/groups/{group_id}/export.csv")
        assert res.status_code == 403
    finally:
        _restore(old)


def test_empty_group_exports_header_only(test_client, db_session):
    group_id = test_client.post("/api/v1/groups", json={"name": "Empty"}).json()["group_id"]
    res = test_client.get(f"/api/v1/groups/{group_id}/export.csv")
    text = res.text.lstrip("﻿")
    rows = list(csv.reader(io.StringIO(text)))
    assert len(rows) == 1
