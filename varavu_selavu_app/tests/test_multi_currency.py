import os
import uuid
from unittest.mock import patch

import pytest

from varavu_selavu_service.db.models import Group, GroupMember, User
from varavu_selavu_service.main import app
from varavu_selavu_service.auth.security import auth_required


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


@patch("varavu_selavu_service.services.fx_rate_service.FxRateService._fetch_rate")
def test_expense_in_foreign_currency_snapshots_fx_rate(mock_fetch, test_client, db_session):
    mock_fetch.return_value = __import__("decimal").Decimal("83.0")  # 1 USD = 83 INR

    group_id = test_client.post("/api/v1/groups", json={"name": "India Trip", "currency": "USD"}).json()["group_id"]
    admin_id = _member_id(db_session, group_id, "test@user.com")

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Taxi",
            "category": "Transport",
            "amount": 830.00,
            "currency": "INR",
            "payers": [{"member_id": admin_id, "amount_paid": 830.00}],
            "split": {"type": "equal", "entries": [{"member_id": admin_id}]},
        },
    )
    assert res.status_code == 201
    row = res.json()["expense"]
    assert row["currency"] == "INR"
    assert row["fx_rate_to_group_currency"] == 83.0
    mock_fetch.assert_called_once()


def test_same_currency_expense_has_no_fx_rate(test_client, db_session):
    group_id = test_client.post("/api/v1/groups", json={"name": "Local", "currency": "USD"}).json()["group_id"]
    admin_id = _member_id(db_session, group_id, "test@user.com")

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Coffee",
            "category": "Food & Drink",
            "amount": 5.00,
            "payers": [{"member_id": admin_id, "amount_paid": 5.00}],
            "split": {"type": "equal", "entries": [{"member_id": admin_id}]},
        },
    )
    row = res.json()["expense"]
    assert row["currency"] == "USD"
    assert row["fx_rate_to_group_currency"] is None


@patch("varavu_selavu_service.services.fx_rate_service.FxRateService._fetch_rate")
def test_balances_convert_foreign_currency_expense_to_group_currency(mock_fetch, test_client, db_session):
    mock_fetch.return_value = __import__("decimal").Decimal("2.0")  # 1 XXX = 2 USD

    db_session.add(User(id=uuid.uuid4(), email="friend@test.com", password_hash="hash"))
    db_session.commit()
    group_id = test_client.post("/api/v1/groups", json={"name": "Mixed", "currency": "USD"}).json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "friend@test.com"})

    admin_id = _member_id(db_session, group_id, "test@user.com")
    friend_id = _member_id(db_session, group_id, "friend@test.com")

    # 100 XXX = 200 USD equivalent, split equally -> friend owes 100 USD.
    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Hotel",
            "category": "Travel",
            "amount": 100.00,
            "currency": "XXX",
            "payers": [{"member_id": admin_id, "amount_paid": 100.00}],
            "split": {"type": "equal", "entries": [{"member_id": admin_id}, {"member_id": friend_id}]},
        },
    )

    balances = test_client.get(f"/api/v1/groups/{group_id}/balances").json()
    nets = {m["member_id"]: m["net"] for m in balances["members"]}
    assert nets[admin_id] == 100.0
    assert nets[friend_id] == -100.0
    transfer = balances["transfers"][0]
    assert transfer["amount"] == 100.0


@patch("varavu_selavu_service.services.fx_rate_service.FxRateService._fetch_rate")
def test_fx_rate_is_cached_per_day(mock_fetch, db_session):
    from varavu_selavu_service.services.fx_rate_service import FxRateService
    from decimal import Decimal

    mock_fetch.return_value = Decimal("1.1")
    svc = FxRateService(db_session)
    r1 = svc.get_rate("EUR", "USD")
    r2 = svc.get_rate("EUR", "USD")
    assert r1 == r2 == Decimal("1.1")
    mock_fetch.assert_called_once()  # second call hit the cache, not the provider
