"""Editing an expense rewrote its shares and forgot which were paid, so "Settle my share"
recorded the same payment again (TS-FIX-104, AC-006)."""
import pytest

from varavu_selavu_service.db.models import Settlement
from tests.test_settlement_idempotency import _rows, group  # noqa: F401 (fixture)
from tests.test_settlements_api import _groups_enabled  # noqa: F401 (fixture)


def _expense_body(admin_id, member_id, description="Dinner", amount=40.0):
    return {
        "date": "11/20/2026", "description": description, "category": "Food", "amount": amount,
        "payers": [{"member_id": admin_id, "amount_paid": amount}],
        "split": {"type": "equal", "entries": [{"member_id": admin_id}, {"member_id": member_id}]},
    }


@pytest.fixture
def settled(test_client, group):
    group_id, admin_id, member_id = group
    base = f"/api/v1/groups/{group_id}/expenses"
    created = test_client.post(base, json=_expense_body(admin_id, member_id))
    assert created.status_code == 201, created.text
    url = f"{base}/{created.json()['expense']['row_id']}"
    first = test_client.post(f"{url}/settle_share", json={"member_id": member_id})
    assert first.status_code == 201, first.text
    return url, admin_id, member_id, first.json()["id"]


def _keep_split(description="Dinner", amount=40.0):
    return {"date": "11/20/2026", "description": description, "category": "Food", "amount": amount}


@pytest.mark.parametrize("edit", [
    "rename, split untouched", "rename, same split sent again", "new amount",
])
def test_an_edited_expense_remembers_the_paid_share(test_client, db_session, settled, edit):
    url, admin_id, member_id, _ = settled
    body = {
        "rename, split untouched": _keep_split("Team dinner"),
        "rename, same split sent again": _expense_body(admin_id, member_id, "Team dinner"),
        "new amount": _keep_split(amount=60.0),
    }[edit]
    assert test_client.put(url, json=body).status_code == 200

    again = test_client.post(f"{url}/settle_share", json={"member_id": member_id})

    assert again.status_code == 409, again.text
    assert len(_rows(db_session)) == 1


def test_undoing_the_payment_after_an_edit_lets_the_share_be_settled(test_client, db_session, settled):
    url, _, member_id, settlement_id = settled
    assert test_client.put(url, json=_keep_split("Team dinner")).status_code == 200
    group_url = url.split("/expenses/")[0]
    assert test_client.delete(f"{group_url}/settlements/{settlement_id}").status_code == 200
    db_session.expire_all()

    again = test_client.post(f"{url}/settle_share", json={"member_id": member_id})

    assert again.status_code == 201, again.text
    assert len(_rows(db_session)) == 1


@pytest.mark.parametrize("amount, split_type", [(60.0, None), (40.0, "exact"), (60.0, "exact")])
def test_editing_receipt_items_remembers_the_paid_share(test_client, db_session, group, amount, split_type):
    """The items edit rewrites the shares too, and it is the only way to change a receipt's amount."""
    group_id, admin_id, member_id = group
    base = f"/api/v1/groups/{group_id}/expenses"
    body = {**_expense_body(admin_id, member_id), "tax": 0, "tip": 0,
            "items": [{"line_no": 1, "item_name": "Meal", "line_total": 40.0}]}
    created = test_client.post(f"{base}/itemized", json=body)
    assert created.status_code == 201, created.text
    url = f"{base}/{created.json()['expense']['row_id']}"
    assert test_client.post(f"{url}/settle_share", json={"member_id": member_id}).status_code == 201

    edit = {"items": [{"line_no": 1, "item_name": "Meal", "line_total": amount}], "amount": amount}
    if split_type:
        edit["split"] = {"type": split_type, "entries": [
            {"member_id": admin_id, "value": amount - 10}, {"member_id": member_id, "value": 10}]}
    saved = test_client.put(f"{url}/items", json=edit)
    assert saved.status_code == 200, saved.text

    again = test_client.post(f"{url}/settle_share", json={"member_id": member_id})

    assert again.status_code == 409, again.text
    assert len(_rows(db_session)) == 1
