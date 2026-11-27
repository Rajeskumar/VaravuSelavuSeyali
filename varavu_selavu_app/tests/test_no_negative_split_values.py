"""TS-FIX-101 AC-004: no minus values are accepted anywhere money is entered or split.

Found 2026-11-26: 10.00 with adjustments +20, -10, -10 stored a single share of 23.33 and silently
dropped the other two. Owner decision the same day: minus values are not allowed at all.
"""
import os
import uuid
from decimal import Decimal

import pytest

from pydantic import ValidationError

from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, Group
from varavu_selavu_service.models.api_models import ExpenseItem
from varavu_selavu_service.services.group_expense_service import GroupExpenseService
from varavu_selavu_service.services.split_engine import SplitError, resolve_split
from tests.test_group_expenses_api import _make_group_with_members


@pytest.fixture(autouse=True)
def _groups_enabled(monkeypatch):
    monkeypatch.setitem(os.environ, "GROUPS_ENABLED", "true")


def _entries(values):
    return [{"member_id": f"m{i}", "value": v} for i, v in enumerate(values)]


@pytest.mark.parametrize("values", [[20, -10, -10], [-1, 0, 0], [0, -0.01]])
def test_adjustment_with_a_minus_value_is_refused(values):
    with pytest.raises(SplitError, match="cannot be negative"):
        resolve_split(Decimal("10.00"), "adjustment", _entries(values))


@pytest.mark.parametrize("split_type", ["equal", "exact", "percentage", "shares", "adjustment"])
def test_no_split_type_takes_a_minus_value(split_type):
    with pytest.raises(SplitError):
        resolve_split(Decimal("100.00"), split_type, _entries([110, -10]))


def test_non_negative_adjustments_still_share_the_whole_total():
    results = resolve_split(Decimal("30.00"), "adjustment", _entries([6, 6, 0]))
    assert [r.amount_owed for r in results] == [Decimal("12.00"), Decimal("12.00"), Decimal("6.00")]


# The item-split engine was removed in TS-FIX-102; a discount larger than the items can no longer
# produce a negative line or share (tests/test_receipt_lines.py).


def _expense_body(m, split_type, values, amount=10.0):
    return {
        "date": "01/15/2026", "description": "Dinner", "category": "Food & Drink", "amount": amount,
        "payers": [{"member_id": m["test@user.com"], "amount_paid": amount}],
        "split": {"type": split_type, "entries": [{"member_id": mid, "value": v} for mid, v in zip(m.values(), values)]},
    }


def test_api_refuses_a_negative_adjustment_and_stores_nothing(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])
    res = test_client.post(f"/api/v1/groups/{group_id}/expenses", json=_expense_body(m, "adjustment", [20, -10, -10]))
    assert res.status_code == 400
    assert "negative" in res.text
    assert db_session.query(Expense).filter(Expense.group_id == uuid.UUID(group_id)).count() == 0
    assert db_session.query(ExpenseSplit).count() == 0


@pytest.mark.parametrize("where,field", [
    ("header", "tax"), ("header", "tip"),
    ("item", "discount"), ("item", "quantity"), ("item", "line_total"), ("item", "unit_price"), ("item", "original_price"),
])
def test_api_refuses_a_minus_value_on_group_receipts(test_client, db_session, where, field):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    item = {"line_no": 1, "item_name": "Steak", "line_total": 10.0}
    body = {
        "date": "01/15/2026", "description": "Dinner", "category": "Food", "amount": 10.0,
        "payers": [{"member_id": m["test@user.com"], "amount_paid": 10.0}],
        "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"], "value": 0}]},
        "items": [item],
    }
    (item if where == "item" else body)[field] = -1
    res = test_client.post(f"/api/v1/groups/{group_id}/expenses/itemized", json=body)
    assert res.status_code == 422
    assert db_session.query(Expense).filter(Expense.group_id == uuid.UUID(group_id)).count() == 0


def test_a_negative_group_default_split_is_not_saved(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    res = test_client.put(f"/api/v1/groups/{group_id}", json={
        "default_split": {"type": "adjustment", "entries": [{"member_id": mid, "value": v} for mid, v in zip(m.values(), [5, -5])]},
    })
    assert res.status_code == 400
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    db_session.refresh(group)
    assert group.default_split_json is None


def test_a_group_with_an_old_negative_default_split_still_loads(test_client, db_session):
    # Saved before this rule: reading it must keep working.
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    group.default_split_json = {"type": "adjustment", "entries": [{"member_id": mid, "value": v} for mid, v in zip(m.values(), [5, -5])]}
    db_session.commit()
    assert test_client.get(f"/api/v1/groups/{group_id}").status_code == 200


def test_a_recurring_template_cannot_save_a_negative_split(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    res = test_client.post("/api/v1/recurring/upsert", json={
        "description": "Rent", "category": "Rent", "day_of_month": 1, "default_cost": 100,
        "start_date_iso": "2026-01-01", "group_id": group_id,
        "split_config": {"type": "adjustment", "entries": [{"member_id": mid, "value": v} for mid, v in zip(m.values(), [5, -5])]},
    })
    assert res.status_code == 400
    assert test_client.get("/api/v1/recurring/templates").json() == []


def test_resaving_an_old_negative_default_split_unchanged_does_not_block_a_rename(test_client, db_session):
    # Both clients send the stored default split back with every settings save.
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    legacy = {"type": "adjustment", "entries": [{"member_id": mid, "value": v} for mid, v in zip(m.values(), [5.0, -5.0])]}
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    group.default_split_json = legacy
    db_session.commit()
    res = test_client.put(f"/api/v1/groups/{group_id}", json={"name": "Renamed", "default_split": legacy})
    assert res.status_code == 200
    # Changing it still cannot introduce a minus value.
    changed = {**legacy, "entries": [{**e, "value": e["value"] * 2} for e in legacy["entries"]]}
    assert test_client.put(f"/api/v1/groups/{group_id}", json={"default_split": changed}).status_code == 400


# Receipt scans record a coupon as a negative line (receipt_text_parser, and both AI prompts). That is
# not something a person types, so it must keep saving until the owner decides how to treat it.
def test_a_scanned_coupon_saves_as_a_paid_price_and_shares_total_the_amount(test_client, db_session):
    # TS-FIX-102: a coupon is folded into the line it applies to; no negative line reaches the server.
    from varavu_selavu_service.services.receipt_lines import normalize_scan
    _, lines, _, _ = normalize_scan({}, [{"item_name": "Vitamins", "line_total": 10.0},
                                         {"item_name": "CVS COUPON", "line_total": -2.0, "unit_price": -2.0}])
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    res = test_client.post(f"/api/v1/groups/{group_id}/expenses/itemized", json={
        "date": "01/15/2026", "description": "Pharmacy", "category": "Food", "amount": 8.0,
        "payers": [{"member_id": m["test@user.com"], "amount_paid": 8.0}],
        "split": {"type": "equal", "entries": [{"member_id": mid, "value": 0} for mid in m.values()]},
        "items": lines,
    })
    assert res.status_code == 201, res.text
    assert sorted(float(s.amount_owed) for s in db_session.query(ExpenseSplit).all()) == [4.0, 4.0]


@pytest.mark.parametrize("old, new", [([1, 1, 1, 1], "0.02"), ([1, 1, 1, 1, 1, 1], "0.03"), ([10, 10, 10], "0.01")])
def test_lowering_an_amount_never_rescales_a_value_below_zero(old, new):
    class Payer:
        def __init__(self, i, paid):
            self.member_id, self.amount_paid = f"m{i}", Decimal(str(paid))

    payers = GroupExpenseService._rescale_payers([Payer(i, v) for i, v in enumerate(old)], Decimal(sum(old)), Decimal(new))
    values = [p["amount_paid"] for p in payers]
    assert min(values) >= 0 and sum(values) == Decimal(new)


def test_lowering_a_group_expense_to_a_few_cents_stores_no_negative_share(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com", "d@test.com"])
    ids = list(m.values())
    created = test_client.post(f"/api/v1/groups/{group_id}/expenses", json={
        "date": "01/15/2026", "description": "Small", "category": "Food", "amount": 4.0,
        "payers": [{"member_id": mid, "amount_paid": 1.0} for mid in ids],
        "split": {"type": "exact", "entries": [{"member_id": mid, "value": 1.0} for mid in ids]},
    })
    expense_id = created.json()["expense"]["row_id"]
    res = test_client.put(f"/api/v1/groups/{group_id}/expenses/{expense_id}", json={
        "date": "01/15/2026", "description": "Small", "category": "Food", "amount": 0.02,
    })
    assert res.status_code == 200, res.text
    rows = db_session.query(ExpenseSplit).filter(ExpenseSplit.expense_id == uuid.UUID(expense_id)).all()
    paid = db_session.query(ExpensePayer).filter(ExpensePayer.expense_id == uuid.UUID(expense_id)).all()
    for values in ([r.amount_owed for r in rows], [p.amount_paid for p in paid]):
        assert min(values) >= 0 and sum(values) == Decimal("0.02")


def test_a_negative_quantity_is_refused_on_item_requests():
    with pytest.raises(ValidationError):
        ExpenseItem(line_no=1, item_name="A", line_total=1, quantity=-1)
