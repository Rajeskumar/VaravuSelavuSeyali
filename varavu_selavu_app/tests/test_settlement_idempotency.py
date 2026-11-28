"""A payment resent after a timeout was stored twice, and settlements net into balances (TS-FIX-104)."""
import uuid
from unittest.mock import patch

import pytest

from varavu_selavu_service.db.models import GroupActivity, Settlement
from varavu_selavu_service.services.notification_service import NotificationService
from varavu_selavu_service.services.settlement_service import SettlementService
from tests.test_settlements_api import _groups_enabled, _make_group_with_two_members  # noqa: F401 (fixture)


def _body(admin_id, member_id, **extra):
    return {"from_member_id": member_id, "to_member_id": admin_id, "amount": 20.0, **extra}


@pytest.fixture
def group(test_client, db_session):
    group_id, admin_id, member_id = _make_group_with_two_members(test_client, db_session)
    return group_id, admin_id, member_id


def _rows(db_session):
    db_session.expire_all()
    return db_session.query(Settlement).all()


def test_sending_the_same_request_again_stores_and_announces_it_once(test_client, db_session, group):
    group_id, admin_id, member_id = group
    url = f"/api/v1/groups/{group_id}/settlements"
    with patch.object(NotificationService, "fan_out") as notify:
        first = test_client.post(url, json=_body(admin_id, member_id, request_id="req-00000001"))
        again = test_client.post(url, json=_body(admin_id, member_id, request_id="req-00000001"))

    assert (first.status_code, again.status_code) == (201, 201)
    # The apps tell the person, so a real second payment isn't taken for recorded.
    assert (first.json()["already_recorded"], again.json()["already_recorded"]) == (False, True)
    assert again.json()["id"] == first.json()["id"]
    assert len(_rows(db_session)) == 1
    assert db_session.query(GroupActivity).filter(GroupActivity.action == "settlement_created").count() == 1
    assert notify.call_count == 1


@pytest.mark.parametrize("change", [{"amount": 21.0}, {"swap": True}])
def test_an_id_reused_for_a_different_payment_is_refused(test_client, db_session, group, change):
    group_id, admin_id, member_id = group
    url = f"/api/v1/groups/{group_id}/settlements"
    test_client.post(url, json=_body(admin_id, member_id, request_id="req-00000001"))
    other = _body(member_id, admin_id) if change.pop("swap", False) else _body(admin_id, member_id)

    res = test_client.post(url, json={**other, **change, "request_id": "req-00000001"})

    assert res.status_code == 409, res.text
    assert len(_rows(db_session)) == 1


@pytest.mark.parametrize("extra", [{}, {"request_id": None}])
def test_without_an_id_two_payments_are_two_payments(test_client, db_session, group, extra):
    group_id, admin_id, member_id = group
    for _ in range(2):
        assert test_client.post(f"/api/v1/groups/{group_id}/settlements", json=_body(admin_id, member_id, **extra)).status_code == 201
    assert len(_rows(db_session)) == 2


def test_different_ids_are_different_payments(test_client, db_session, group):
    group_id, admin_id, member_id = group
    for key in ("req-00000001", "req-00000002"):
        test_client.post(f"/api/v1/groups/{group_id}/settlements", json=_body(admin_id, member_id, request_id=key))
    assert len(_rows(db_session)) == 2


@pytest.mark.parametrize("bad", ["short", "x" * 65, "has space here", "drop;table--1"])
def test_a_malformed_id_is_refused(test_client, db_session, group, bad):
    group_id, admin_id, member_id = group
    res = test_client.post(f"/api/v1/groups/{group_id}/settlements", json=_body(admin_id, member_id, request_id=bad))
    assert res.status_code == 422
    assert _rows(db_session) == []


def test_a_concurrent_send_that_loses_the_race_returns_the_winner(test_client, db_session, group):
    """Both requests see no stored row; the unique index stops the second insert."""
    group_id, admin_id, member_id = group
    url = f"/api/v1/groups/{group_id}/settlements"
    first = test_client.post(url, json=_body(admin_id, member_id, request_id="req-00000001"))
    real = SettlementService._find_request
    calls = []

    def missed_once(self, *args):
        calls.append(1)
        return None if len(calls) == 1 else real(self, *args)

    with patch.object(SettlementService, "_find_request", missed_once), patch.object(NotificationService, "fan_out") as notify:
        res = test_client.post(url, json=_body(admin_id, member_id, request_id="req-00000001"))

    assert res.status_code == 201, res.text
    assert res.json()["id"] == first.json()["id"]
    assert len(_rows(db_session)) == 1
    assert notify.call_count == 0


def test_settling_a_share_locks_it_while_checking(test_client, db_session, group):
    """SQLite ignores row locks, so this checks the query asks for one; the PostgreSQL rehearsal exercises it."""
    from sqlalchemy.orm import Query

    group_id, admin_id, member_id = group
    expense_id = test_client.post(f"/api/v1/groups/{group_id}/expenses", json={
        "date": "01/15/2026", "description": "Dinner", "category": "Food & Drink", "amount": 100.0,
        "payers": [{"member_id": admin_id, "amount_paid": 100.0}],
        "split": {"type": "equal", "entries": [{"member_id": admin_id}, {"member_id": member_id}]},
    }).json()["expense"]["row_id"]
    locked = []
    real = Query.with_for_update

    def spy(self, *args, **kwargs):
        locked.append(self.column_descriptions[0]["name"])
        return real(self, *args, **kwargs)

    with patch.object(Query, "with_for_update", spy):
        res = test_client.post(f"/api/v1/groups/{group_id}/expenses/{expense_id}/settle_share", json={"member_id": member_id})

    assert res.status_code == 200 or res.status_code == 201, res.text
    assert "Expense" in locked
