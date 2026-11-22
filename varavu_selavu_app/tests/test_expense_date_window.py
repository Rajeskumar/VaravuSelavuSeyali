"""Product rule (2026-11-22): expenses can't be future-dated and can't be older than a year.

Recurring is the supported way to schedule upcoming spend; older history is out of scope."""

from datetime import timedelta

import pytest
from conftest import PINNED_TODAY
from varavu_selavu_service.core.expense_dates import (
    FUTURE_MESSAGE,
    TOO_OLD_MESSAGE,
    date_problem,
)


def mdy(d):
    return d.strftime("%m/%d/%Y")


def body(d, **kw):
    return {"user_id": "x", "cost": 10, "category": "Groceries", "description": "Milk", "date": mdy(d), **kw}


@pytest.mark.parametrize(
    "delta,expected",
    [
        (0, None),
        (1, None),  # a day of slack for timezones ahead of UTC
        (2, FUTURE_MESSAGE),
        (-365, None),
        (-366, None),  # a day of slack on the old side too
        (-367, TOO_OLD_MESSAGE),
    ],
)
def test_window_edges(delta, expected):
    assert date_problem(mdy(PINNED_TODAY + timedelta(days=delta)), today=PINNED_TODAY) == expected


def test_future_expense_is_rejected(test_client, db_session):
    res = test_client.post("/api/v1/expenses", json=body(PINNED_TODAY + timedelta(days=10)))
    assert res.status_code == 422
    assert FUTURE_MESSAGE in res.text


def test_expense_older_than_a_year_is_rejected(test_client, db_session):
    res = test_client.post("/api/v1/expenses", json=body(PINNED_TODAY - timedelta(days=400)))
    assert res.status_code == 422
    assert TOO_OLD_MESSAGE in res.text


def test_expense_within_window_is_accepted(test_client, db_session):
    res = test_client.post("/api/v1/expenses", json=body(PINNED_TODAY - timedelta(days=200)))
    assert res.status_code == 201, res.text


def test_itemized_expense_obeys_the_window(test_client, db_session):
    payload = {
        "user_email": "test@user.com",
        "header": {"purchased_at": mdy(PINNED_TODAY + timedelta(days=30)), "amount": 5.0, "category_id": "Shopping", "fingerprint": "future-items"},
        "items": [{"line_no": 1, "item_name": "Widget", "line_total": 5.0}],
    }
    res = test_client.post("/api/v1/expenses/with_items", json=payload)
    assert res.status_code == 422


def test_editing_an_old_expense_keeps_its_date_but_cannot_move_to_another_old_date(test_client, db_session):
    from varavu_selavu_service.db.models import Expense
    test_client.post("/api/v1/expenses", json=body(PINNED_TODAY - timedelta(days=100)))
    row = db_session.query(Expense).one()
    expense_id = str(row.id)
    row.purchased_at = row.purchased_at - timedelta(days=500)  # legacy row older than a year
    db_session.commit()
    old_date = mdy(row.purchased_at.date())

    same_date = test_client.put(f"/api/v1/expenses/{expense_id}", json=body(row.purchased_at.date(), description="Renamed"))
    assert same_date.status_code == 200, same_date.text
    assert old_date == mdy(row.purchased_at.date())

    other_old = test_client.put(f"/api/v1/expenses/{expense_id}", json=body(PINNED_TODAY - timedelta(days=650)))
    assert other_old.status_code == 422


def test_future_date_also_rejected_on_edit(test_client, db_session):
    from varavu_selavu_service.db.models import Expense
    test_client.post("/api/v1/expenses", json=body(PINNED_TODAY - timedelta(days=3)))
    expense_id = str(db_session.query(Expense).one().id)
    res = test_client.put(f"/api/v1/expenses/{expense_id}", json=body(PINNED_TODAY + timedelta(days=9)))
    assert res.status_code == 422
