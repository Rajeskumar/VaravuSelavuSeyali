"""A blank split value (older mobile builds send one for every untouched field) was an unhandled error (TS-FIX-103).

`Decimal('None')` raised InvalidOperation, so the API answered 500 and the app treated the save as unconfirmed.
"""
import os
import uuid
from decimal import Decimal

import pytest

from varavu_selavu_service.db.models import Expense
from varavu_selavu_service.services.split_engine import SplitError, resolve_split
from tests.test_group_expenses_api import _make_group_with_members


@pytest.fixture(autouse=True)
def _groups_enabled(monkeypatch):
    monkeypatch.setitem(os.environ, "GROUPS_ENABLED", "true")


FILLED = {"exact": 30, "percentage": 100, "shares": 1, "adjustment": 1}


@pytest.mark.parametrize("split_type", sorted(FILLED))
def test_a_blank_value_is_a_split_error(split_type):
    entries = [{"member_id": "a", "value": FILLED[split_type]}, {"member_id": "b", "value": None}]
    with pytest.raises(SplitError, match="Enter a value for everyone"):
        resolve_split(Decimal("30.00"), split_type, entries)


def test_equal_split_still_ignores_blank_values():
    results = resolve_split(Decimal("30.00"), "equal", [{"member_id": "a", "value": None}, {"member_id": "b", "value": None}])
    assert [r.amount_owed for r in results] == [Decimal("15.00"), Decimal("15.00")]


@pytest.mark.parametrize("split_type", sorted(FILLED))
def test_api_answers_400_with_the_reason_and_stores_nothing(test_client, db_session, split_type):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    ids = list(m.values())
    res = test_client.post(f"/api/v1/groups/{group_id}/expenses", json={
        "date": "11/20/2026", "description": "Dinner", "category": "Food & Drink", "amount": 30.0,
        "payers": [{"member_id": ids[0], "amount_paid": 30.0}],
        "split": {"type": split_type, "entries": [{"member_id": ids[0], "value": FILLED[split_type]}, {"member_id": ids[1]}]},
    })
    assert res.status_code == 400, res.text
    assert "Enter a value for everyone" in res.text
    assert db_session.query(Expense).filter(Expense.group_id == uuid.UUID(group_id)).count() == 0
