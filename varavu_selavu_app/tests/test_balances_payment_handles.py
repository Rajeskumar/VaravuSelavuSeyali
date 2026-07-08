import os
import uuid

import pytest

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


def test_balances_include_payment_handles_for_registered_members_only(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="friend@test.com", password_hash="hash", venmo_handle="@friend"))
    db_session.commit()
    group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "friend@test.com"})
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"display_name": "Placeholder Pal"})

    balances = test_client.get(f"/api/v1/groups/{group_id}/balances").json()

    friend_entry = next(m for m in balances["members"] if m["display_name"] == "friend@test.com")
    assert friend_entry["venmo_handle"] == "@friend"

    placeholder_entry = next(m for m in balances["members"] if m["display_name"] == "Placeholder Pal")
    assert placeholder_entry["venmo_handle"] is None
