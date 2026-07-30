import os
import uuid

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import (
    Expense,
    ExpenseItem,
    ExpenseItemSplit,
    ExpensePayer,
    ExpenseSplit,
    Group,
    GroupMember,
    User,
)
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


def _make_group_with_members(test_client, db_session, other_emails):
    """test@user.com (default auth override) is the admin/creator."""
    for email in other_emails:
        db_session.add(User(id=uuid.uuid4(), email=email, password_hash="hash", name=email.split("@")[0]))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    member_ids = {}
    admin_member = db_session.query(GroupMember).filter(
        GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com"
    ).first()
    member_ids["test@user.com"] = str(admin_member.id)

    for email in other_emails:
        res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": email})
        member_ids[email] = res.json()["member_id"]

    return group_id, member_ids


# ---------------------------------------------------------------------------
# Personal itemized expenses
# ---------------------------------------------------------------------------

def _create_personal_itemized(test_client):
    res = test_client.post(
        "/api/v1/expenses/with_items",
        json={
            "user_email": "test@user.com",
            "header": {
                "purchased_at": "2026-01-15T12:00:00Z",
                "merchant_name": "Costco",
                "amount": 30.0,
                "category_name": "Groceries",
                "main_category_name": "Food & Drink",
                "tax": 0.0,
                "discount": 0.0,
                "fingerprint": "personal-items-fp-1",
            },
            "items": [
                {"line_no": 1, "item_name": "Milk", "line_total": 10.0},
                {"line_no": 2, "item_name": "Eggs", "line_total": 20.0},
            ],
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["expense_id"]


def test_get_items_returns_items_after_creation(test_client, db_session):
    expense_id = _create_personal_itemized(test_client)

    res = test_client.get(f"/api/v1/expenses/{expense_id}/items")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["amount"] == 30.0
    names = sorted(i["item_name"] for i in body["items"])
    assert names == ["Eggs", "Milk"]


def test_put_items_replaces_and_updates_amount(test_client, db_session):
    expense_id = _create_personal_itemized(test_client)

    res = test_client.put(
        f"/api/v1/expenses/{expense_id}/items",
        json={
            "items": [
                {"line_no": 1, "item_name": "Milk", "line_total": 12.0},
                {"line_no": 2, "item_name": "Bread", "line_total": 8.0},
            ],
            "amount": 20.0,
            "tax": 0.0,
            "discount": 0.0,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["amount"] == 20.0
    names = sorted(i["item_name"] for i in body["items"])
    assert names == ["Bread", "Milk"]

    expense = db_session.query(Expense).filter(Expense.id == uuid.UUID(expense_id)).first()
    assert float(expense.amount) == 20.0
    items = db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == expense.id).all()
    assert len(items) == 2


def test_put_items_rejects_non_reconciling_total(test_client, db_session):
    expense_id = _create_personal_itemized(test_client)

    res = test_client.put(
        f"/api/v1/expenses/{expense_id}/items",
        json={
            "items": [{"line_no": 1, "item_name": "Milk", "line_total": 12.0}],
            "amount": 999.0,
            "tax": 0.0,
            "discount": 0.0,
        },
    )
    assert res.status_code == 400


def test_put_items_rejects_empty_items(test_client, db_session):
    expense_id = _create_personal_itemized(test_client)

    # A valid amount is used so this exercises the empty-items branch rather than
    # tripping the amount > 0 schema constraint first (which returns 422).
    res = test_client.put(
        f"/api/v1/expenses/{expense_id}/items",
        json={"items": [], "amount": 10.0, "tax": 0.0, "discount": 0.0},
    )
    assert res.status_code == 400


# ---------------------------------------------------------------------------
# Group itemized expenses
# ---------------------------------------------------------------------------

def test_group_get_and_put_items_rescales_payers_and_splits(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])

    create_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses/itemized",
        json={
            "date": "01/15/2026",
            "description": "Groceries",
            "category": "Food & Drink",
            "amount": 100.0,
            "payers": [
                {"member_id": m["test@user.com"], "amount_paid": 60.0},
                {"member_id": m["b@test.com"], "amount_paid": 40.0},
            ],
            "items": [
                {
                    "line_no": 1,
                    "item_name": "Steak",
                    "line_total": 60.0,
                    "member_ratios": {m["test@user.com"]: 1.0},
                },
                {
                    "line_no": 2,
                    "item_name": "Wine",
                    "line_total": 40.0,
                    "member_ratios": {m["b@test.com"]: 0.5, m["c@test.com"]: 0.5},
                },
            ],
        },
    )
    assert create_res.status_code == 201, create_res.text
    expense_id = create_res.json()["expense"]["row_id"]

    get_res = test_client.get(f"/api/v1/groups/{group_id}/expenses/{expense_id}/items")
    assert get_res.status_code == 200, get_res.text
    assert get_res.json()["amount"] == 100.0
    assert len(get_res.json()["items"]) == 2

    # Double the total by editing item prices — all 3 members had item splits before the
    # edit (test@user.com on Steak, b@test.com + c@test.com on Wine), so the update should
    # re-split every item equally across all 3, and rescale payer amounts proportionally
    # (60/100 -> 120, 40/100 -> 80) to keep summing to the new total.
    put_res = test_client.put(
        f"/api/v1/groups/{group_id}/expenses/{expense_id}/items",
        json={
            "items": [
                {"line_no": 1, "item_name": "Steak", "line_total": 120.0},
                {"line_no": 2, "item_name": "Wine", "line_total": 80.0},
            ],
            "amount": 200.0,
            "tax": 0.0,
            "discount": 0.0,
        },
    )
    assert put_res.status_code == 200, put_res.text
    assert put_res.json()["amount"] == 200.0

    eid = uuid.UUID(expense_id)
    expense = db_session.query(Expense).filter(Expense.id == eid).first()
    assert float(expense.amount) == 200.0

    payers = db_session.query(ExpensePayer).filter(ExpensePayer.expense_id == eid).all()
    assert round(sum(float(p.amount_paid) for p in payers), 2) == 200.0
    payer_by_member = {str(p.member_id): float(p.amount_paid) for p in payers}
    assert payer_by_member[m["test@user.com"]] == 120.0
    assert payer_by_member[m["b@test.com"]] == 80.0

    splits = db_session.query(ExpenseSplit).filter(ExpenseSplit.expense_id == eid).all()
    assert round(sum(float(s.amount_owed) for s in splits), 2) == 200.0

    items = db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == eid).all()
    assert len(items) == 2
    item_splits = (
        db_session.query(ExpenseItemSplit)
        .join(ExpenseItem, ExpenseItemSplit.expense_item_id == ExpenseItem.id)
        .filter(ExpenseItem.expense_id == eid)
        .all()
    )
    # 2 items x 3 participants, equal-split across all 3 members who had any item split before.
    assert len(item_splits) == 6
    for s in item_splits:
        # ratio column is Numeric(7, 4), so 1/3 rounds to 0.3333.
        assert float(s.ratio) == pytest.approx(1 / 3, abs=1e-4)


def test_group_put_items_rejects_non_reconciling_total(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    create_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses/itemized",
        json={
            "date": "01/15/2026",
            "description": "Snacks",
            "category": "Food & Drink",
            "amount": 20.0,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 20.0}],
            "items": [
                {"line_no": 1, "item_name": "Chips", "line_total": 20.0, "member_ratios": {m["test@user.com"]: 1.0}},
            ],
        },
    )
    assert create_res.status_code == 201
    expense_id = create_res.json()["expense"]["row_id"]

    res = test_client.put(
        f"/api/v1/groups/{group_id}/expenses/{expense_id}/items",
        json={
            "items": [{"line_no": 1, "item_name": "Chips", "line_total": 20.0}],
            "amount": 999.0,
            "tax": 0.0,
            "discount": 0.0,
        },
    )
    assert res.status_code == 400
