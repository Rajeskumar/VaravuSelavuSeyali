"""TS-FIX-102: group receipts split on the total; paid-price lines; totals must match on every save path."""
import uuid
from decimal import Decimal

import pytest

from varavu_selavu_service.db.models import (
    Expense, ExpenseItem, ExpenseItemSplit, ExpensePayer, ExpenseSplit,
)
from tests.test_group_expenses_api import _groups_enabled, _make_group_with_members  # noqa: F401


def _receipt(m, members, *, amount, items, split=None, tax=0, tip=0, payer="test@user.com"):
    return {
        "date": "11/20/2026",
        "description": "Costco",
        "category": "Groceries",
        "amount": amount,
        "payers": [{"member_id": m[payer], "amount_paid": amount}],
        "split": split or {"type": "equal", "entries": [{"member_id": m[e], "value": 0} for e in members]},
        "tax": tax,
        "tip": tip,
        "items": items,
    }


def _shares(db, eid):
    return {str(s.member_id): Decimal(str(s.amount_owed)) for s in db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == eid)}


def _post(client, gid, body):
    return client.post(f"/api/v1/groups/{gid}/expenses/itemized", json=body)


EMAILS = ["b@test.com", "c@test.com"]
ALL = ["test@user.com", *EMAILS]


# ---- S-01 / S-02 / S-03: split on the total -------------------------------------------------------------

def test_equal_receipt_shares_equal_amount_and_store_tax_tip(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    body = _receipt(m, ALL, amount=33.34, tax=3.34,
                    items=[{"line_no": 1, "item_name": "Milk", "line_total": 10.00},
                           {"line_no": 2, "item_name": "Eggs", "line_total": 20.00}])
    res = _post(test_client, gid, body)
    assert res.status_code == 201, res.text
    row = res.json()["expense"]
    assert row["split_type"] == "equal" and row["has_items"] is True
    eid = uuid.UUID(row["row_id"])
    shares = sorted(_shares(db_session, eid).values())
    assert shares == [Decimal("11.11"), Decimal("11.11"), Decimal("11.12")]
    exp = db_session.get(Expense, eid)
    assert Decimal(str(exp.tax)) == Decimal("3.34") and Decimal(str(exp.tip)) == Decimal("0")
    item_ids = [i.id for i in db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == eid)]
    assert db_session.query(ExpenseItemSplit).filter(ExpenseItemSplit.expense_item_id.in_(item_ids)).count() == 0
    assert all(i.original_price is not None for i in db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == eid))


def test_exact_and_shares_receipts(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    items = [{"line_no": 1, "item_name": "Pizza", "line_total": 30.00}]
    exact = _receipt(m, ALL[:2], amount=30.00, items=items, split={"type": "exact", "entries": [
        {"member_id": m["test@user.com"], "value": 20.00}, {"member_id": m["b@test.com"], "value": 10.00}]})
    res = _post(test_client, gid, exact)
    assert res.status_code == 201, res.text
    assert sorted(_shares(db_session, uuid.UUID(res.json()["expense"]["row_id"])).values()) == [Decimal("10.00"), Decimal("20.00")]

    bad = _receipt(m, ALL[:2], amount=30.00, items=items, split={"type": "exact", "entries": [
        {"member_id": m["test@user.com"], "value": 20.00}, {"member_id": m["b@test.com"], "value": 5.00}]})
    assert _post(test_client, gid, bad).status_code == 400

    shares = _receipt(m, ALL[:2], amount=10.00, items=[{"line_no": 1, "item_name": "Tea", "line_total": 10.00}],
                      split={"type": "shares", "entries": [
                          {"member_id": m["test@user.com"], "value": 2}, {"member_id": m["b@test.com"], "value": 1}]})
    res = _post(test_client, gid, shares)
    assert res.status_code == 201, res.text
    assert sum(_shares(db_session, uuid.UUID(res.json()["expense"]["row_id"])).values()) == Decimal("10.00")


@pytest.mark.parametrize("split_type", ["percentage", "adjustment"])
def test_receipt_refuses_percentage_and_adjustment(test_client, db_session, split_type):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    body = _receipt(m, ALL, amount=30.00, items=[{"line_no": 1, "item_name": "X", "line_total": 30.00}],
                    split={"type": split_type, "entries": [{"member_id": m[e], "value": 0} for e in ALL]})
    res = _post(test_client, gid, body)
    assert res.status_code == 400
    # Manual group expenses keep every split type.
    manual = test_client.post(f"/api/v1/groups/{gid}/expenses", json={
        "date": "11/20/2026", "description": "Rent", "category": "Rent", "amount": 30.00,
        "payers": [{"member_id": m["test@user.com"], "amount_paid": 30.00}],
        "split": {"type": "percentage", "entries": [{"member_id": m["test@user.com"], "value": 50}, {"member_id": m["b@test.com"], "value": 50}]},
    })
    assert manual.status_code == 201, manual.text


# ---- S-04: the P0 ------------------------------------------------------------------------------------------

def test_receipt_items_must_match_amount(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    body = _receipt(m, ALL[:2], amount=100.00, items=[{"line_no": 1, "item_name": "Milk", "line_total": 10.00}])
    res = _post(test_client, gid, body)
    assert res.status_code == 400
    assert db_session.query(Expense).filter(Expense.group_id == uuid.UUID(gid)).count() == 0


def test_receipt_refuses_empty_items(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    assert _post(test_client, gid, _receipt(m, ALL, amount=10.00, items=[])).status_code == 400


# ---- S-12: item assignment is gone --------------------------------------------------------------------------

@pytest.mark.parametrize("ratios", [None, "empty"])
def test_item_assignment_is_refused_with_update_message(test_client, db_session, ratios):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    member_ratios = {} if ratios == "empty" else {m["test@user.com"]: 0.5, m["b@test.com"]: 0.5}
    old_client = {
        "date": "11/20/2026", "description": "Costco", "category": "Groceries", "amount": 10.00,
        "payers": [{"member_id": m["test@user.com"], "amount_paid": 10.00}],
        # Coupon line as old apps sent it: must still get the update message, not a validation error.
        "items": [{"line_no": 1, "item_name": "Milk", "line_total": 12.00, "member_ratios": member_ratios},
                  {"line_no": 2, "item_name": "Coupon", "line_total": -2.00, "member_ratios": member_ratios}],
    }
    res = _post(test_client, gid, old_client)
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert detail["code"] == "app_update_required"
    assert "Update TrackSpense" in detail["message"]
    assert db_session.query(Expense).filter(Expense.group_id == uuid.UUID(gid)).count() == 0


def test_suggest_assignment_route_is_gone(test_client, db_session):
    gid, _ = _make_group_with_members(test_client, db_session, EMAILS)
    assert test_client.get(f"/api/v1/groups/{gid}/items/suggest_assignment?item_name=milk").status_code == 404


# ---- Legacy item-split receipts (S-08, S-13, S-16) -----------------------------------------------------------

def _legacy_receipt(db, gid, m, *, amount="100.00", shares=(("test@user.com", "70.00"), ("b@test.com", "30.00")),
                    lines=(("Steak", "70.00", "0"), ("Wine", "30.00", "0")), discount_on_first="0"):
    """An item-split receipt as saved before TS-FIX-102: split_type itemized, assignment rows, no original_price."""
    eid = uuid.uuid4()
    db.add(Expense(id=eid, user_email="test@user.com", group_id=uuid.UUID(gid), split_type="itemized",
                   purchased_at=__import__("datetime").datetime(2026, 11, 20), category_id="Food",
                   amount=Decimal(amount), description="Dinner"))
    db.flush()
    db.add(ExpensePayer(id=uuid.uuid4(), expense_id=eid, member_id=uuid.UUID(m["test@user.com"]), amount_paid=Decimal(amount)))
    for email, owed in shares:
        db.add(ExpenseSplit(id=uuid.uuid4(), expense_id=eid, member_id=uuid.UUID(m[email]), amount_owed=Decimal(owed), basis_type="itemized"))
    item_ids = []
    for n, (name, total, disc) in enumerate(lines, 1):
        iid = uuid.uuid4()
        item_ids.append(iid)
        db.add(ExpenseItem(id=iid, expense_id=eid, user_email="test@user.com", line_no=n, item_name=name,
                           normalized_name=name, line_total=Decimal(total), tax=0,
                           discount=Decimal(discount_on_first if n == 1 else "0")))
        db.flush()
        owner = shares[0][0] if n == 1 else shares[1][0]
        db.add(ExpenseItemSplit(id=uuid.uuid4(), expense_item_id=iid, member_id=uuid.UUID(m[owner]), ratio=Decimal("1"), amount=Decimal(total)))
    db.commit()
    return eid, item_ids


def test_item_edit_with_same_amount_keeps_old_shares_and_assignments(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    eid, item_ids = _legacy_receipt(db_session, gid, m)
    before = _shares(db_session, eid)
    got = test_client.get(f"/api/v1/groups/{gid}/expenses/{eid}/items").json()
    lines = [{"id": i["id"], "line_no": i["line_no"], "item_name": i["item_name"] + (" (renamed)" if i["line_no"] == 1 else ""),
              "line_total": i["line_total"]} for i in got["items"]]
    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{eid}/items", json={"items": lines, "amount": 100.00, "tax": 0})
    assert res.status_code == 200, res.text
    db_session.expire_all()
    assert _shares(db_session, eid) == before  # 70/30 stays 70/30
    assert db_session.get(Expense, eid).split_type == "itemized"
    assert db_session.query(ExpenseItemSplit).filter(ExpenseItemSplit.expense_item_id.in_(item_ids)).count() == 2


def test_amount_change_on_old_or_exact_receipt_requires_a_split(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    eid, _ = _legacy_receipt(db_session, gid, m)
    lines = [{"line_no": 1, "item_name": "Steak", "line_total": 80.00}, {"line_no": 2, "item_name": "Wine", "line_total": 30.00}]
    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{eid}/items", json={"items": lines, "amount": 110.00})
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "split_required"

    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{eid}/items", json={
        "items": lines, "amount": 110.00,
        "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"], "value": 0}, {"member_id": m["b@test.com"], "value": 0}]},
    })
    assert res.status_code == 200, res.text
    db_session.expire_all()
    assert sorted(_shares(db_session, eid).values()) == [Decimal("55.00"), Decimal("55.00")]
    assert db_session.get(Expense, eid).split_type == "equal"

    # A new Exact receipt also asks; an Equal one re-splits on its own.
    exact = _post(test_client, gid, _receipt(m, ALL[:2], amount=30.00, items=[{"line_no": 1, "item_name": "A", "line_total": 30.00}],
                                             split={"type": "exact", "entries": [{"member_id": m["test@user.com"], "value": 20}, {"member_id": m["b@test.com"], "value": 10}]}))
    xid = exact.json()["expense"]["row_id"]
    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{xid}/items", json={"items": [{"line_no": 1, "item_name": "A", "line_total": 31.00}], "amount": 31.00})
    assert res.status_code == 400 and res.json()["detail"]["code"] == "split_required"

    equal = _post(test_client, gid, _receipt(m, ALL, amount=30.00, items=[{"line_no": 1, "item_name": "A", "line_total": 30.00}]))
    qid = equal.json()["expense"]["row_id"]
    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{qid}/items", json={"items": [{"line_no": 1, "item_name": "A", "line_total": 31.00}], "amount": 31.00})
    assert res.status_code == 200, res.text
    assert sum(_shares(db_session, uuid.UUID(qid)).values()) == Decimal("31.00")


def test_old_group_receipt_with_line_discount_is_shown_converted(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    eid, _ = _legacy_receipt(db_session, gid, m, amount="98.00", shares=(("test@user.com", "68.00"), ("b@test.com", "30.00")),
                             discount_on_first="2.00")
    got = test_client.get(f"/api/v1/groups/{gid}/expenses/{eid}/items").json()
    assert got["legacy_discount_format"] is True
    assert got["discount"] == 0
    first = got["items"][0]
    assert (first["line_total"], first["discount"], first["original_price"]) == (68.0, 2.0, 70.0)
    lines = [{"id": i["id"], "line_no": i["line_no"], "item_name": i["item_name"], "line_total": i["line_total"],
              "discount": i["discount"]} for i in got["items"]]
    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{eid}/items", json={"items": lines, "amount": 98.00})
    assert res.status_code == 200, res.text
    assert res.json()["legacy_discount_format"] is False
    assert sorted(_shares(db_session, eid).values()) == [Decimal("30.00"), Decimal("68.00")]


def test_group_put_on_receipt_refuses_percentage_and_amount_drift(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, EMAILS)
    res = _post(test_client, gid, _receipt(m, ALL[:2], amount=30.00, items=[{"line_no": 1, "item_name": "A", "line_total": 30.00}]))
    rid = res.json()["expense"]["row_id"]
    base = {"date": "11/20/2026", "description": "Costco", "category": "Groceries", "amount": 30.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 30.00}]}
    pct = {**base, "split": {"type": "percentage", "entries": [{"member_id": m["test@user.com"], "value": 50}, {"member_id": m["b@test.com"], "value": 50}]}}
    assert test_client.put(f"/api/v1/groups/{gid}/expenses/{rid}", json=pct).status_code == 400
    drift = {**base, "amount": 40.00, "payers": [{"member_id": m["test@user.com"], "amount_paid": 40.00}],
             "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"], "value": 0}]}}
    assert test_client.put(f"/api/v1/groups/{gid}/expenses/{rid}", json=drift).status_code == 400


# ---- Personal receipts (S-09, S-10, S-11, S-14, S-15) ---------------------------------------------------------

def _personal(amount, items, **header):
    return {"user_email": "test@user.com",
            "header": {"purchased_at": "2026-11-20T12:00:00", "amount": amount, "description": "Dinner",
                       "category_name": "Dining out", **header},
            "items": items}


def test_personal_receipt_keeps_tip_on_create_and_edit(test_client, db_session):
    res = test_client.post("/api/v1/expenses/with_items", json=_personal(51.20, [{"line_no": 1, "item_name": "Meal", "line_total": 40.00}], tax=3.20, tip=8.00))
    assert res.status_code == 201, res.text
    eid = res.json()["expense_id"]
    got = test_client.get(f"/api/v1/expenses/{eid}/items").json()
    assert got["tip"] == 8.0
    put = {"items": [{"line_no": 1, "item_name": "Meal (edited)", "line_total": 40.00}], "amount": 51.20, "tax": 3.20, "tip": 8.00}
    res = test_client.put(f"/api/v1/expenses/{eid}/items", json=put)
    assert res.status_code == 200, res.text
    assert res.json()["tip"] == 8.0
    res = test_client.put(f"/api/v1/expenses/{eid}/items", json={**put, "tip": 0})
    assert res.status_code == 400


def test_personal_header_discount_is_refused_line_discount_is_a_record(test_client, db_session):
    old = test_client.post("/api/v1/expenses/with_items", json=_personal(8.00, [{"line_no": 1, "item_name": "Milk", "line_total": 10.00}], discount=2.00))
    assert old.status_code == 400
    assert old.json()["detail"]["code"] == "app_update_required"

    res = test_client.post("/api/v1/expenses/with_items", json=_personal(8.00, [{"line_no": 1, "item_name": "Milk", "line_total": 8.00, "discount": 2.00}]))
    assert res.status_code == 201, res.text
    exp = db_session.get(Expense, uuid.UUID(res.json()["expense_id"]))
    assert Decimal(str(exp.amount)) == Decimal("8.00") and Decimal(str(exp.discount)) == Decimal("2.00")
    item = db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == exp.id).one()
    assert (Decimal(str(item.line_total)), Decimal(str(item.original_price))) == (Decimal("8.00"), Decimal("10.00"))


@pytest.mark.parametrize("line,status,original", [
    ({"line_total": 8.00, "discount": 2.00}, 201, "10.00"),
    ({"line_total": 8.00, "discount": 2.00, "original_price": 10.00}, 201, "10.00"),
    ({"line_total": 8.00, "original_price": 10.00}, 201, "10.00"),
    ({"line_total": 8.00, "discount": 2.00, "original_price": 12.00}, 400, None),
    ({"line_total": -2.00}, 422, None),
    ({"line_total": 8.00, "discount": -1.00}, 422, None),
])
def test_personal_line_original_price_rules(test_client, db_session, line, status, original):
    res = test_client.post("/api/v1/expenses/with_items", json=_personal(8.00, [{"line_no": 1, "item_name": "Milk", **line}]))
    assert res.status_code == status, res.text
    if original:
        item = db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == uuid.UUID(res.json()["expense_id"])).one()
        assert Decimal(str(item.original_price)) == Decimal(original)


def _legacy_personal(db, *, header_discount="3.00", lines=(("A", "10.00"), ("B", "20.00")), amount="27.00"):
    eid = uuid.uuid4()
    db.add(Expense(id=eid, user_email="test@user.com", split_type="itemized", category_id="Groceries",
                   purchased_at=__import__("datetime").datetime(2026, 11, 20), amount=Decimal(amount),
                   tax=0, tip=0, discount=Decimal(header_discount), description="Shop"))
    db.flush()
    for n, (name, total) in enumerate(lines, 1):
        db.add(ExpenseItem(id=uuid.uuid4(), expense_id=eid, user_email="test@user.com", line_no=n, item_name=name,
                           normalized_name=name, line_total=Decimal(total), tax=0, discount=0))
    db.commit()
    return eid


def test_old_personal_receipt_is_converted_on_read_and_saved_once(test_client, db_session):
    eid = _legacy_personal(db_session)
    got = test_client.get(f"/api/v1/expenses/{eid}/items").json()
    assert got["legacy_discount_format"] is True and got["discount"] == 0
    assert [(i["line_total"], i["discount"], i["original_price"]) for i in got["items"]] == [(9.0, 1.0, 10.0), (18.0, 2.0, 20.0)]
    db_session.expire_all()
    assert [i.original_price for i in db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == eid)] == [None, None]

    lines = [{"line_no": i["line_no"], "item_name": i["item_name"], "line_total": i["line_total"], "discount": i["discount"]} for i in got["items"]]
    res = test_client.put(f"/api/v1/expenses/{eid}/items", json={"items": lines, "amount": 27.00})
    assert res.status_code == 200, res.text
    again = test_client.get(f"/api/v1/expenses/{eid}/items").json()
    assert again["legacy_discount_format"] is False
    assert [i["line_total"] for i in again["items"]] == [9.0, 18.0]
    assert again["amount"] == 27.0


def test_old_client_item_edit_with_header_discount_is_refused(test_client, db_session):
    eid = _legacy_personal(db_session)
    res = test_client.put(f"/api/v1/expenses/{eid}/items", json={
        "items": [{"line_no": 1, "item_name": "A", "line_total": 10.00}, {"line_no": 2, "item_name": "B", "line_total": 20.00}],
        "amount": 27.00, "discount": 3.00})
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "app_update_required"


# ---- S-17 / S-18: analytics use paid prices and follow shares ------------------------------------------------

def test_group_receipt_item_insights_follow_shares_and_back_out_on_delete(test_client, db_session):
    from varavu_selavu_service.db.models import ItemInsight
    gid, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    body = _receipt(m, ["test@user.com", "b@test.com"], amount=8.00,
                    items=[{"line_no": 1, "item_name": "Milk", "normalized_name": "Milk", "quantity": 1,
                            "unit_price": 8.00, "line_total": 8.00, "discount": 2.00}])
    body["merchant_name"] = "Costco"
    res = _post(test_client, gid, body)
    assert res.status_code == 201, res.text
    db_session.expire_all()
    insights = {i.user_email: i for i in db_session.query(ItemInsight).filter(ItemInsight.normalized_name == "Milk")}
    assert set(insights) == {"test@user.com", "b@test.com"}
    assert all(Decimal(str(i.total_spent)) == Decimal("4.00") for i in insights.values())
    assert all(Decimal(str(i.avg_unit_price)) == Decimal("8.00") for i in insights.values())

    rid = res.json()["expense"]["row_id"]
    assert test_client.delete(f"/api/v1/groups/{gid}/expenses/{rid}").status_code == 200
    db_session.expire_all()
    assert all(Decimal(str(i.total_spent or 0)) == Decimal("0.00")
               for i in db_session.query(ItemInsight).filter(ItemInsight.normalized_name == "Milk"))


def test_personal_price_history_uses_paid_unit_price(test_client, db_session):
    from varavu_selavu_service.db.models import ItemPriceHistory
    from varavu_selavu_service.services.receipt_lines import normalize_scan
    _, lines, _, _ = normalize_scan({}, [{"item_name": "Soda", "normalized_name": "Soda", "quantity": 2,
                                          "unit_price": 5.00, "line_total": 10.00},
                                         {"item_name": "CPN", "line_total": -2.00}])
    res = test_client.post("/api/v1/expenses/with_items", json=_personal(8.00, lines, merchant_name="Target"))
    assert res.status_code == 201, res.text
    db_session.expire_all()
    prices = [Decimal(str(h.unit_price)) for h in db_session.query(ItemPriceHistory)]
    assert prices == [Decimal("4.00")]


# ---- Review fixes (code review F1/F2/F4/F5, security SEC-1/SEC-2, proxy-line receipts) -------------------

def test_moved_plain_expense_is_not_treated_as_a_receipt(test_client, db_session):
    # Every personal expense has a synthesized proxy line; moving it into a group must not make it a receipt.
    gid, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    created = test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "date": "11/20/2026",
                                                         "description": "Taxi", "category": "Taxi", "cost": 30.0})
    assert created.status_code in (200, 201), created.text
    eid = db_session.query(Expense).filter(Expense.description == "Taxi").one().id
    moved = test_client.post(f"/api/v1/expenses/{eid}/move_to_group", json={"group_id": gid, "split": {
        "type": "percentage", "entries": [{"member_id": m["test@user.com"], "value": 50}, {"member_id": m["b@test.com"], "value": 50}]}})
    assert moved.status_code == 200, moved.text
    assert moved.json()["expense"]["has_items"] is False
    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{eid}", json={
        "date": "11/20/2026", "description": "Taxi", "category": "Taxi", "amount": 40.0,
        "payers": [{"member_id": m["test@user.com"], "amount_paid": 40.0}],
        "split": {"type": "adjustment", "entries": [{"member_id": m["test@user.com"], "value": 0}, {"member_id": m["b@test.com"], "value": 0}]}})
    assert res.status_code == 200, res.text


def test_personal_plain_edit_cannot_change_a_receipt_amount(test_client, db_session):
    res = test_client.post("/api/v1/expenses/with_items", json=_personal(10.00, [{"line_no": 1, "item_name": "A", "line_total": 10.00}]))
    eid = res.json()["expense_id"]
    body = {"user_id": "test@user.com", "date": "11/20/2026", "description": "Shop", "category": "Groceries"}
    assert test_client.put(f"/api/v1/expenses/{eid}", json={**body, "cost": 25.0}).status_code == 400
    ok = test_client.put(f"/api/v1/expenses/{eid}", json={**body, "cost": 10.0})
    assert ok.status_code == 200, ok.text
    item = db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == uuid.UUID(eid)).one()
    assert item.item_name == "A"  # receipt lines are not overwritten by the plain edit


def test_old_receipt_whose_figures_fall_short_stays_editable(test_client, db_session):
    # An old group receipt edited by the pre-change items PUT lost its tax: lines 90 + nothing = amount 100.
    gid, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    eid, _ = _legacy_receipt(db_session, gid, m, lines=(("Steak", "60.00", "0"), ("Wine", "30.00", "0")))
    got = test_client.get(f"/api/v1/groups/{gid}/expenses/{eid}/items").json()
    assert got["tax"] == 10.0 and got["amount"] == 100.0  # shortfall shown as tax, so it reconciles
    before = _shares(db_session, eid)
    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{eid}", json={
        "date": "11/20/2026", "description": "Dinner (renamed)", "category": "Food", "amount": 100.00})
    assert res.status_code == 200, res.text
    db_session.expire_all()
    assert _shares(db_session, eid) == before
    # ±0.02 drift through the plain edit is refused: the amount changes only through the items edit.
    drift = test_client.put(f"/api/v1/groups/{gid}/expenses/{eid}", json={
        "date": "11/20/2026", "description": "Dinner", "category": "Food", "amount": 100.01})
    assert drift.status_code == 400


def test_old_personal_receipt_moved_to_a_group_keeps_its_header_discount(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    eid = _legacy_personal(db_session)
    moved = test_client.post(f"/api/v1/expenses/{eid}/move_to_group", json={"group_id": gid, "split": {
        "type": "equal", "entries": [{"member_id": m["test@user.com"]}, {"member_id": m["b@test.com"]}]}})
    assert moved.status_code == 200, moved.text
    got = test_client.get(f"/api/v1/groups/{gid}/expenses/{eid}/items").json()
    assert [i["line_total"] for i in got["items"]] == [9.0, 18.0]
    assert got["legacy_discount_format"] is True


def test_a_receipt_moved_to_a_group_is_split_on_its_total_only(test_client, db_session):
    gid, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    res = test_client.post("/api/v1/expenses/with_items", json=_personal(10.00, [{"line_no": 1, "item_name": "A", "line_total": 10.00}]))
    eid = res.json()["expense_id"]
    moved = test_client.post(f"/api/v1/expenses/{eid}/move_to_group", json={"group_id": gid, "split": {
        "type": "percentage", "entries": [{"member_id": m["test@user.com"], "value": 50}, {"member_id": m["b@test.com"], "value": 50}]}})
    assert moved.status_code == 400


def test_item_insights_follow_a_split_edit_and_back_out_exactly(test_client, db_session):
    from varavu_selavu_service.db.models import ItemInsight
    gid, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    body = _receipt(m, ["test@user.com", "b@test.com"], amount=8.00,
                    items=[{"line_no": 1, "item_name": "Milk", "normalized_name": "Milk", "quantity": 1, "line_total": 8.00}])
    body["merchant_name"] = "Costco"
    rid = _post(test_client, gid, body).json()["expense"]["row_id"]
    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{rid}", json={
        "date": "11/20/2026", "description": "Costco", "category": "Groceries", "amount": 8.00, "merchant_name": "Costco",
        "payers": [{"member_id": m["test@user.com"], "amount_paid": 8.00}],
        "split": {"type": "exact", "entries": [{"member_id": m["test@user.com"], "value": 8.00}]}})
    assert res.status_code == 200, res.text
    db_session.expire_all()
    spent = {i.user_email: Decimal(str(i.total_spent)) for i in db_session.query(ItemInsight).filter(ItemInsight.normalized_name == "Milk")}
    assert spent == {"test@user.com": Decimal("8.00"), "b@test.com": Decimal("0.00")}
    assert test_client.delete(f"/api/v1/groups/{gid}/expenses/{rid}").status_code == 200
    db_session.expire_all()
    assert all(Decimal(str(i.total_spent)) == 0 for i in db_session.query(ItemInsight).filter(ItemInsight.normalized_name == "Milk"))


def test_personal_item_edit_refuses_a_split(test_client, db_session):
    res = test_client.post("/api/v1/expenses/with_items", json=_personal(10.00, [{"line_no": 1, "item_name": "A", "line_total": 10.00}]))
    eid = res.json()["expense_id"]
    put = test_client.put(f"/api/v1/expenses/{eid}/items", json={
        "items": [{"line_no": 1, "item_name": "A", "line_total": 10.00}], "amount": 10.00,
        "split": {"type": "equal", "entries": []}})
    assert put.status_code == 400


def test_an_edited_price_updates_the_paid_unit_price(test_client, db_session):
    res = test_client.post("/api/v1/expenses/with_items", json=_personal(
        8.00, [{"line_no": 1, "item_name": "Soda", "quantity": 2, "unit_price": 5.00, "line_total": 8.00, "discount": 2.00}]))
    item = db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == uuid.UUID(res.json()["expense_id"])).one()
    assert Decimal(str(item.unit_price)) == Decimal("4.00")


def test_moved_receipt_item_insights_move_to_shares_and_back_out_cleanly(test_client, db_session):
    # Re-review N1: a moved personal receipt was backed out of group item insights it never added.
    from varavu_selavu_service.db.models import ItemInsight
    gid, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    db_session.add(ItemInsight(user_email="b@test.com", normalized_name="Milk", total_spent=Decimal("3.00"),
                               total_quantity_bought=Decimal("1"), avg_unit_price=Decimal("3.00")))
    db_session.commit()
    res = test_client.post("/api/v1/expenses/with_items", json=_personal(
        10.00, [{"line_no": 1, "item_name": "Milk", "normalized_name": "Milk", "quantity": 1, "line_total": 10.00}], merchant_name="Costco"))
    eid = res.json()["expense_id"]
    moved = test_client.post(f"/api/v1/expenses/{eid}/move_to_group", json={"group_id": gid, "split": {
        "type": "equal", "entries": [{"member_id": m["test@user.com"]}, {"member_id": m["b@test.com"]}]}})
    assert moved.status_code == 200, moved.text
    db_session.expire_all()
    spent = {i.user_email: Decimal(str(i.total_spent)) for i in db_session.query(ItemInsight).filter(ItemInsight.normalized_name == "Milk")}
    assert spent == {"test@user.com": Decimal("5.00"), "b@test.com": Decimal("8.00")}
    assert test_client.delete(f"/api/v1/groups/{gid}/expenses/{eid}").status_code == 200
    db_session.expire_all()
    spent = {i.user_email: Decimal(str(i.total_spent)) for i in db_session.query(ItemInsight).filter(ItemInsight.normalized_name == "Milk")}
    assert spent == {"test@user.com": Decimal("0.00"), "b@test.com": Decimal("3.00")}


def test_old_one_line_item_split_receipt_stays_a_receipt_after_a_re_split(test_client, db_session):
    # Re-review N2.
    gid, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    eid, _ = _legacy_receipt(db_session, gid, m, amount="70.00", shares=(("test@user.com", "70.00"), ("b@test.com", "0.01")),
                             lines=(("Steak", "70.00", "0"),))
    res = test_client.put(f"/api/v1/groups/{gid}/expenses/{eid}", json={
        "date": "11/20/2026", "description": "Dinner", "category": "Food", "amount": 70.00,
        "payers": [{"member_id": m["test@user.com"], "amount_paid": 70.00}],
        "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"]}, {"member_id": m["b@test.com"]}]}})
    assert res.status_code == 200, res.text
    assert res.json()["expense"]["has_items"] is True
    drift = test_client.put(f"/api/v1/groups/{gid}/expenses/{eid}", json={
        "date": "11/20/2026", "description": "Dinner", "category": "Food", "amount": 80.00})
    assert drift.status_code == 400
