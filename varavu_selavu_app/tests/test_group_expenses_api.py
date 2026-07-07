import os
import random
import uuid

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, Group, GroupMember, User
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


def _make_group_with_members(test_client, db_session, other_emails):
    """test@user.com (default auth override) is the admin/creator. Returns (group_id, {email: member_id})."""
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


def test_create_equal_split_persists_correctly(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    assert res.status_code == 201
    body = res.json()["expense"]
    assert body["cost"] == 90.00
    assert body["my_share"] == 30.00
    assert len(body["payer_summary"]) == 1

    expense_id = uuid.UUID(body["row_id"])
    expense = db_session.query(Expense).filter(Expense.id == expense_id).first()
    assert expense.group_id == uuid.UUID(group_id)
    assert expense.split_type == "equal"

    splits = db_session.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense_id).all()
    payers = db_session.query(ExpensePayer).filter(ExpensePayer.expense_id == expense_id).all()
    assert sum(float(s.amount_owed) for s in splits) == 90.00
    assert sum(float(p.amount_paid) for p in payers) == 90.00
    assert len(payers) == 1


def test_create_exact_split_persists_correctly(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Rent",
            "category": "Housing",
            "amount": 100.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 100.00}],
            "split": {
                "type": "exact",
                "entries": [
                    {"member_id": m["test@user.com"], "value": 60.00},
                    {"member_id": m["b@test.com"], "value": 40.00},
                ],
            },
        },
    )
    assert res.status_code == 201
    assert res.json()["expense"]["my_share"] == 60.00


def test_create_percentage_split_persists_correctly(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {
                "type": "percentage",
                "entries": [
                    {"member_id": m["test@user.com"], "value": 50},
                    {"member_id": m["b@test.com"], "value": 30},
                    {"member_id": m["c@test.com"], "value": 20},
                ],
            },
        },
    )
    assert res.status_code == 201
    assert res.json()["expense"]["my_share"] == 45.00


def test_percentage_not_summing_to_100_returns_400_with_details(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 100.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 100.00}],
            "split": {
                "type": "percentage",
                "entries": [
                    {"member_id": m["test@user.com"], "value": 50},
                    {"member_id": m["b@test.com"], "value": 40},
                ],
            },
        },
    )
    assert res.status_code == 400
    assert "total_percentage" in res.json()["detail"]


def test_multiple_payers_rejected_in_phase_1(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 100.00,
            "payers": [
                {"member_id": m["test@user.com"], "amount_paid": 50.00},
                {"member_id": m["b@test.com"], "amount_paid": 50.00},
            ],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    assert res.status_code == 400


def test_member_not_in_group_returns_400(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])
    outsider_id = str(uuid.uuid4())

    res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 100.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 100.00}],
            "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"]}, {"member_id": outsider_id}]},
        },
    )
    assert res.status_code == 400


def test_my_share_zero_for_non_participant(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])

    # Subset participation (E8): only test@user.com and b@test.com split; c@test.com excluded.
    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Coffee",
            "category": "Food & Drink",
            "amount": 10.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 10.00}],
            "split": {
                "type": "equal",
                "entries": [{"member_id": m["test@user.com"]}, {"member_id": m["b@test.com"]}],
            },
        },
    )

    old = _as_user("c@test.com")
    try:
        res = test_client.get(f"/api/v1/groups/{group_id}/expenses")
    finally:
        _restore(old)
    assert res.status_code == 200
    assert res.json()["items"][0]["my_share"] == 0.0


def test_non_member_access_returns_403(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    old = _as_user("outsider@test.com")
    try:
        create_res = test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026",
                "description": "Dinner",
                "category": "Food",
                "amount": 10.00,
                "payers": [{"member_id": m["test@user.com"], "amount_paid": 10.00}],
                "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"]}]},
            },
        )
        list_res = test_client.get(f"/api/v1/groups/{group_id}/expenses")
    finally:
        _restore(old)

    assert create_res.status_code == 403
    assert list_res.status_code == 403


def test_edit_by_non_author_member_resplits_correctly(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    create_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food",
            "amount": 100.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 100.00}],
            "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"]}, {"member_id": m["b@test.com"]}]},
        },
    )
    expense_id = create_res.json()["expense"]["row_id"]

    # b@test.com (not the author) edits the expense — any member may edit (§5.2/§17.2).
    old = _as_user("b@test.com")
    try:
        edit_res = test_client.put(
            f"/api/v1/groups/{group_id}/expenses/{expense_id}",
            json={
                "date": "01/16/2026",
                "description": "Dinner (updated)",
                "category": "Food",
                "amount": 60.00,
                "payers": [{"member_id": m["test@user.com"], "amount_paid": 60.00}],
                "split": {
                    "type": "exact",
                    "entries": [
                        {"member_id": m["test@user.com"], "value": 45.00},
                        {"member_id": m["b@test.com"], "value": 15.00},
                    ],
                },
            },
        )
    finally:
        _restore(old)

    assert edit_res.status_code == 200
    body = edit_res.json()["expense"]
    assert body["cost"] == 60.00
    assert body["description"] == "Dinner (updated)"

    splits = db_session.query(ExpenseSplit).filter(ExpenseSplit.expense_id == uuid.UUID(expense_id)).all()
    assert len(splits) == 2
    assert sum(float(s.amount_owed) for s in splits) == 60.00

    payers = db_session.query(ExpensePayer).filter(ExpensePayer.expense_id == uuid.UUID(expense_id)).all()
    assert len(payers) == 1
    assert float(payers[0].amount_paid) == 60.00


def test_delete_cascades_splits_and_payers(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    create_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food",
            "amount": 50.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 50.00}],
            "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"]}, {"member_id": m["b@test.com"]}]},
        },
    )
    expense_id = uuid.UUID(create_res.json()["expense"]["row_id"])

    delete_res = test_client.delete(f"/api/v1/groups/{group_id}/expenses/{expense_id}")
    assert delete_res.status_code == 200

    assert db_session.query(Expense).filter(Expense.id == expense_id).first() is None
    assert db_session.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense_id).first() is None
    assert db_session.query(ExpensePayer).filter(ExpensePayer.expense_id == expense_id).first() is None


def test_list_pagination(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com"])

    for i in range(3):
        test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": f"01/1{i}/2026",
                "description": f"Item {i}",
                "category": "Food",
                "amount": 10.00,
                "payers": [{"member_id": m["test@user.com"], "amount_paid": 10.00}],
                "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"]}]},
            },
        )

    res = test_client.get(f"/api/v1/groups/{group_id}/expenses", params={"limit": 2, "offset": 0})
    body = res.json()
    assert len(body["items"]) == 2
    assert body["next_offset"] == 2

    res2 = test_client.get(f"/api/v1/groups/{group_id}/expenses", params={"limit": 2, "offset": 2})
    body2 = res2.json()
    assert len(body2["items"]) == 1
    assert body2["next_offset"] is None


def test_random_amounts_sum_to_the_cent_after_persistence_and_readback(test_client, db_session):
    """§3.3 invariant reused from TS-GRP-103's SplitEngine unit tests, exercised at the
    API layer this time: sum(splits.amount_owed) == expense.amount, to the cent, after
    a full create -> DB round trip (not just at the pure-function level)."""
    group_id, m = _make_group_with_members(test_client, db_session, ["b@test.com", "c@test.com"])
    member_ids = list(m.values())

    for _ in range(15):
        amount = round(random.uniform(0.01, 5000.00), 2)
        n = random.randint(1, 3)
        participants = random.sample(member_ids, n)

        res = test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026",
                "description": "Random",
                "category": "Food",
                "amount": amount,
                "payers": [{"member_id": participants[0], "amount_paid": amount}],
                "split": {"type": "equal", "entries": [{"member_id": p} for p in participants]},
            },
        )
        assert res.status_code == 201
        expense_id = uuid.UUID(res.json()["expense"]["row_id"])

        splits = db_session.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense_id).all()
        payers = db_session.query(ExpensePayer).filter(ExpensePayer.expense_id == expense_id).all()
        assert round(sum(float(s.amount_owed) for s in splits), 2) == amount
        assert round(sum(float(p.amount_paid) for p in payers), 2) == amount
