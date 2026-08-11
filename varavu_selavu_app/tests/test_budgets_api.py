"""tests/test_budgets_api.py — TS-BUD-101 Budgets & Spending Limits.

Covers the PRD's functional requirements: FR-1 create, FR-2 dedupe-on-create-edits-existing,
FR-3 scope-aware spent via the same AnalysisService the /analysis endpoint uses (no third
calculation path), FR-8 soft delete retains history, plus amount validation and suggestions.
"""
import os
import uuid
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import Group, GroupMember, User
from varavu_selavu_service.main import app
from varavu_selavu_service.models.api_models import ResolvedPeriod, ResolvedScope
from varavu_selavu_service.services.chat_service import ChatResult

TODAY = date.today()
THIS_MONTH = TODAY.strftime("%m/%d/%Y")


def _prior_month_date(months_back: int) -> str:
    y, m = TODAY.year, TODAY.month
    for _ in range(months_back):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return date(y, m, 15).strftime("%m/%d/%Y")


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


def _add_personal_expense(test_client, description: str, category: str, cost: float, date_str: str = THIS_MONTH):
    res = test_client.post(
        "/api/v1/expenses",
        json={
            "user_id": "test@user.com",
            "cost": cost,
            "category": category,
            "description": description,
            "date": date_str,
        },
    )
    assert res.status_code == 201, res.json()
    return res.json()


def test_create_category_budget_reflects_live_spent(test_client, db_session):
    _add_personal_expense(test_client, "Costco run", "Groceries", 60.0)
    _add_personal_expense(test_client, "Trader Joe's", "Groceries", 25.0)

    res = test_client.post(
        "/api/v1/budgets",
        json={"target_type": "category", "category": "Groceries", "amount": 200.0, "scope": "personal"},
    )
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["scope"] == "personal"
    assert body["category"] == "Groceries"
    assert body["spent"] == 85.0
    assert body["remaining"] == 115.0
    assert body["status"] in ("on_track", "at_risk", "over_pace", "exceeded")
    assert body["is_snapshot"] is False

    listed = test_client.get("/api/v1/budgets").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]
    assert listed[0]["spent"] == 85.0


def test_overall_budget_uses_total_expenses(test_client, db_session):
    _add_personal_expense(test_client, "Rent", "Rent", 1000.0)
    _add_personal_expense(test_client, "Dinner", "Dining out", 40.0)

    res = test_client.post("/api/v1/budgets", json={"target_type": "overall", "amount": 2000.0})
    assert res.status_code == 200
    assert res.json()["spent"] == 1040.0
    assert res.json()["category"] is None


def test_duplicate_create_edits_existing_fr2(test_client, db_session):
    first = test_client.post(
        "/api/v1/budgets",
        json={"target_type": "category", "category": "Dining out", "amount": 100.0},
    ).json()

    second = test_client.post(
        "/api/v1/budgets",
        json={"target_type": "category", "category": "Dining out", "amount": 250.0},
    ).json()

    assert second["id"] == first["id"]
    assert second["amount"] == 250.0

    listed = test_client.get("/api/v1/budgets").json()
    assert len([b for b in listed if b["category"] == "Dining out"]) == 1


def test_category_required_for_category_target_type(test_client, db_session):
    res = test_client.post("/api/v1/budgets", json={"target_type": "category", "amount": 100.0})
    assert res.status_code == 422


@pytest.mark.parametrize("amount", [0, -5])
def test_amount_must_be_positive(test_client, db_session, amount):
    res = test_client.post("/api/v1/budgets", json={"target_type": "overall", "amount": amount})
    assert res.status_code == 422


def test_amount_over_max_rejected(test_client, db_session):
    res = test_client.post("/api/v1/budgets", json={"target_type": "overall", "amount": 10_000_000})
    assert res.status_code == 422


def test_combined_scope_includes_group_share(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="roommate@test.com", password_hash="hash"))
    db_session.commit()

    group_res = test_client.post("/api/v1/groups", json={"name": "Apartment"})
    group_id = group_res.json()["group_id"]
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    my_member = db_session.query(GroupMember).filter(
        GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com"
    ).first()
    other_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "roommate@test.com"})
    other_member_id = other_res.json()["member_id"]

    # $60 group grocery run, split equally -> my share is $30.
    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": THIS_MONTH,
            "description": "Costco",
            "category": "Groceries",
            "amount": 60.0,
            "payers": [{"member_id": str(my_member.id), "amount_paid": 60.0}],
            "split": {"type": "equal", "entries": [{"member_id": str(my_member.id)}, {"member_id": other_member_id}]},
        },
    )
    _add_personal_expense(test_client, "Farmers market", "Groceries", 15.0)

    personal_budget = test_client.post(
        "/api/v1/budgets",
        json={"target_type": "category", "category": "Groceries", "amount": 200.0, "scope": "personal"},
    ).json()
    combined_budget = test_client.post(
        "/api/v1/budgets",
        json={"target_type": "category", "category": "Groceries", "amount": 200.0, "scope": "combined"},
    ).json()

    assert personal_budget["spent"] == 15.0
    assert combined_budget["spent"] == 45.0  # 15 personal + 30 my-share


def test_soft_delete_excludes_from_list_but_keeps_row(test_client, db_session):
    created = test_client.post("/api/v1/budgets", json={"target_type": "overall", "amount": 500.0}).json()

    del_res = test_client.delete(f"/api/v1/budgets/{created['id']}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    listed = test_client.get("/api/v1/budgets").json()
    assert created["id"] not in [b["id"] for b in listed]

    from varavu_selavu_service.db.models import Budget
    row = db_session.query(Budget).filter(Budget.id == uuid.UUID(created["id"])).first()
    assert row is not None
    assert row.deleted_at is not None


def test_update_budget_amount(test_client, db_session):
    created = test_client.post("/api/v1/budgets", json={"target_type": "overall", "amount": 500.0}).json()
    res = test_client.patch(f"/api/v1/budgets/{created['id']}", json={"amount": 750.0, "muted": True})
    assert res.status_code == 200
    assert res.json()["amount"] == 750.0
    assert res.json()["muted"] is True


def test_breakdown_returns_contributing_transactions(test_client, db_session):
    _add_personal_expense(test_client, "Movie night", "Movies", 30.0)
    budget = test_client.post(
        "/api/v1/budgets", json={"target_type": "category", "category": "Movies", "amount": 100.0}
    ).json()

    res = test_client.get(f"/api/v1/budgets/{budget['id']}/breakdown")
    assert res.status_code == 200
    body = res.json()
    assert body["budget"]["id"] == budget["id"]
    assert len(body["transactions"]) == 1
    assert body["transactions"][0]["description"] == "Movie night"
    assert body["transactions"][0]["cost"] == 30.0


def test_exceeded_status_when_spent_over_amount(test_client, db_session):
    _add_personal_expense(test_client, "Big splurge", "Dining out", 150.0)
    budget = test_client.post(
        "/api/v1/budgets", json={"target_type": "category", "category": "Dining out", "amount": 100.0}
    ).json()
    assert budget["status"] == "exceeded"
    assert budget["remaining"] == -50.0


def test_suggestions_median_of_last_three_months(test_client, db_session):
    _add_personal_expense(test_client, "m1", "Groceries", 100.0, date_str=_prior_month_date(1))
    _add_personal_expense(test_client, "m2", "Groceries", 200.0, date_str=_prior_month_date(2))
    _add_personal_expense(test_client, "m3", "Groceries", 300.0, date_str=_prior_month_date(3))

    res = test_client.get("/api/v1/budgets/suggestions")
    assert res.status_code == 200
    suggestions = {s["category"]: s for s in res.json()}
    assert "Groceries" in suggestions
    assert suggestions["Groceries"]["suggested_amount"] == 200.0
    assert suggestions["Groceries"]["based_on_months"] == 3


def test_budgets_endpoints_404_when_disabled(test_client, db_session):
    old_val = os.environ.get("BUDGETS_ENABLED")
    os.environ["BUDGETS_ENABLED"] = "false"
    try:
        res = test_client.get("/api/v1/budgets")
        assert res.status_code == 404
    finally:
        if old_val is not None:
            os.environ["BUDGETS_ENABLED"] = old_val
        else:
            os.environ.pop("BUDGETS_ENABLED", None)


@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_ask_why_grounds_prompt_in_budget_and_transactions(mock_call_chat_model, test_client, db_session):
    """§5.4 — the ask-why prompt handed to the model must include the budget's own figures and
    every contributing transaction from get_breakdown, not just a generic pre-filled question."""
    mock_call_chat_model.return_value = ChatResult(
        response="You're over Dining out mostly because of one $150 splurge.",
        resolved_period=ResolvedPeriod(start_date="2023-05-01", end_date="2023-05-31", label="May 2023", source="explicit_param"),
        resolved_scope=ResolvedScope(kind="personal"),
    )
    _add_personal_expense(test_client, "Big splurge", "Dining out", 150.0)
    budget = test_client.post(
        "/api/v1/budgets", json={"target_type": "category", "category": "Dining out", "amount": 100.0}
    ).json()

    res = test_client.post(f"/api/v1/budgets/{budget['id']}/ask-why")
    assert res.status_code == 200
    assert res.json()["response"] == "You're over Dining out mostly because of one $150 splurge."

    assert mock_call_chat_model.call_count == 1
    prompt = mock_call_chat_model.call_args.kwargs["messages"][0]["content"]
    assert "Dining out" in prompt
    assert "Big splurge" in prompt
    assert "$150.00" in prompt
    assert "exceeded" in prompt


def test_ask_why_404_for_missing_budget(test_client, db_session):
    res = test_client.post("/api/v1/budgets/00000000-0000-0000-0000-000000000000/ask-why")
    assert res.status_code == 404


def test_never_accepts_client_supplied_user_id(test_client, db_session):
    """FR-10 — the budget belongs to auth_required's identity, any user_id-shaped field in the
    payload is ignored/rejected rather than trusted (CreateBudgetRequest has no such field at
    all, which is the point: there is nothing to spoof)."""
    res = test_client.post(
        "/api/v1/budgets",
        json={"target_type": "overall", "amount": 100.0, "user_id": "someone-else@test.com"},
    )
    assert res.status_code == 200
    from varavu_selavu_service.db.models import Budget
    row = db_session.query(Budget).filter(Budget.id == uuid.UUID(res.json()["id"])).first()
    assert row.user_email == "test@user.com"
