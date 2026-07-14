"""
TS-CHAT-01x — the chat agent's create_expense / create_group_expense tools.

Covers the extracted, LLM-free `_create_personal_expense_from_agent` /
`_create_group_expense_from_agent` helpers directly against a real DB session
(same pattern as `test_chat_period_scope_resolution.py`'s
`_fetch_group_balance_summary` end-to-end test) — no LangGraph agent or real
LLM involved, so these run fast and deterministically.
"""
import os

import pytest
from sqlalchemy import select

from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit
from varavu_selavu_service.services.chat_service import (
    _create_group_expense_from_agent,
    _create_personal_expense_from_agent,
    _resolve_payer,
)
from varavu_selavu_service.services.expense_service import ExpenseService
from varavu_selavu_service.services.group_expense_service import GroupExpenseService
from varavu_selavu_service.services.group_service import GroupService

USER = "test@user.com"


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


# --------------------------------------------------------------------------- #
# _create_personal_expense_from_agent
# --------------------------------------------------------------------------- #

def test_create_personal_expense_from_agent_creates_real_expense(db_session):
    expense_service = ExpenseService(db_session)

    result = _create_personal_expense_from_agent(
        expense_service, USER, description="Coffee at Blue Bottle",
        amount=6.75, category="Dining out", expense_date="2026-07-14",
    )

    assert "Logged" in result
    assert "$6.75" in result

    rows = db_session.execute(
        select(Expense).where(Expense.user_email == USER, Expense.group_id.is_(None))
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].description == "Coffee at Blue Bottle"
    assert rows[0].category_id == "Dining out"
    assert float(rows[0].amount) == 6.75


def test_create_personal_expense_from_agent_rejects_non_positive_amount(db_session):
    expense_service = ExpenseService(db_session)

    result = _create_personal_expense_from_agent(
        expense_service, USER, description="Free sample", amount=0, category="Other",
    )

    assert result.startswith("Error")
    rows = db_session.execute(select(Expense).where(Expense.user_email == USER)).scalars().all()
    assert len(rows) == 0


def test_create_personal_expense_from_agent_rejects_empty_description(db_session):
    expense_service = ExpenseService(db_session)

    result = _create_personal_expense_from_agent(
        expense_service, USER, description="   ", amount=10, category="Other",
    )

    assert result.startswith("Error")
    rows = db_session.execute(select(Expense).where(Expense.user_email == USER)).scalars().all()
    assert len(rows) == 0


def test_create_personal_expense_from_agent_defaults_missing_category(db_session):
    expense_service = ExpenseService(db_session)

    _create_personal_expense_from_agent(
        expense_service, USER, description="Mystery charge", amount=5, category="",
    )

    row = db_session.execute(select(Expense).where(Expense.user_email == USER)).scalars().one()
    assert row.category_id == "General"


def test_create_personal_expense_from_agent_stores_merchant_name(db_session):
    expense_service = ExpenseService(db_session)

    _create_personal_expense_from_agent(
        expense_service, USER, description="Coffee", amount=6.75, category="Dining out",
        merchant_name="Blue Bottle",
    )

    row = db_session.execute(select(Expense).where(Expense.user_email == USER)).scalars().one()
    assert row.merchant_name == "Blue Bottle"


# --------------------------------------------------------------------------- #
# _create_group_expense_from_agent
# --------------------------------------------------------------------------- #

def test_create_group_expense_from_agent_splits_equally_among_members(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Roommates", "group_type": "home"})
    assert create_res.status_code == 201
    group_id = create_res.json()["group_id"]

    # A second, placeholder member (no login required) so the equal split has more than one share.
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"display_name": "Sam"})
    assert member_res.status_code == 201

    group_service = GroupService(db_session)
    group_expense_service = GroupExpenseService(db_session)
    user_groups = group_service.list_groups_for_user(USER)

    result = _create_group_expense_from_agent(
        group_service, group_expense_service, user_groups, USER,
        group_name="Roommates", description="Groceries at Costco",
        amount=100.0, category="Groceries", expense_date="2026-07-14",
    )

    assert "Logged" in result
    assert "$100.00" in result
    assert "$50.00" in result  # your share, 2 members

    rows = db_session.execute(
        select(Expense).where(Expense.group_id.is_not(None), Expense.description == "Groceries at Costco")
    ).scalars().all()
    assert len(rows) == 1
    expense = rows[0]
    assert float(expense.amount) == 100.0

    payers = db_session.execute(
        select(ExpensePayer).where(ExpensePayer.expense_id == expense.id)
    ).scalars().all()
    assert len(payers) == 1
    assert float(payers[0].amount_paid) == 100.0

    splits = db_session.execute(
        select(ExpenseSplit).where(ExpenseSplit.expense_id == expense.id)
    ).scalars().all()
    assert len(splits) == 2
    assert all(float(s.amount_owed) == 50.0 for s in splits)


def test_create_group_expense_from_agent_stores_merchant_name(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Roommates", "group_type": "home"})
    group_id = create_res.json()["group_id"]

    group_service = GroupService(db_session)
    group_expense_service = GroupExpenseService(db_session)
    user_groups = group_service.list_groups_for_user(USER)

    _create_group_expense_from_agent(
        group_service, group_expense_service, user_groups, USER,
        group_name="Roommates", description="Costco run", amount=50.0, category="Groceries",
        merchant_name="Costco",
    )

    expense = db_session.execute(
        select(Expense).where(Expense.group_id.is_not(None))
    ).scalars().one()
    assert expense.merchant_name == "Costco"


def test_create_group_expense_from_agent_paid_by_resolves_named_member(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Roommates", "group_type": "home"})
    group_id = create_res.json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"display_name": "Sam"})

    group_service = GroupService(db_session)
    group_expense_service = GroupExpenseService(db_session)
    user_groups = group_service.list_groups_for_user(USER)
    detail = group_service.get_group_detail(group_id, USER)
    sam = next(m for m in detail["members"] if m["display_name"] == "Sam")

    result = _create_group_expense_from_agent(
        group_service, group_expense_service, user_groups, USER,
        group_name="Roommates", description="Pizza night", amount=60.0, category="Dining out",
        paid_by="Sam",
    )

    assert "paid by Sam" in result
    expense = db_session.execute(
        select(Expense).where(Expense.group_id.is_not(None))
    ).scalars().one()
    payer = db_session.execute(
        select(ExpensePayer).where(ExpensePayer.expense_id == expense.id)
    ).scalars().one()
    assert str(payer.member_id) == sam["member_id"]


def test_create_group_expense_from_agent_paid_by_unset_defaults_to_caller(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Roommates", "group_type": "home"})
    group_id = create_res.json()["group_id"]
    test_client.post(f"/api/v1/groups/{group_id}/members", json={"display_name": "Sam"})

    group_service = GroupService(db_session)
    group_expense_service = GroupExpenseService(db_session)
    user_groups = group_service.list_groups_for_user(USER)

    result = _create_group_expense_from_agent(
        group_service, group_expense_service, user_groups, USER,
        group_name="Roommates", description="Pizza night", amount=60.0, category="Dining out",
    )

    assert "paid by you" in result


def test_create_group_expense_from_agent_paid_by_unknown_member_returns_error_and_creates_nothing(test_client, db_session):
    create_res = test_client.post("/api/v1/groups", json={"name": "Roommates", "group_type": "home"})
    group_id = create_res.json()["group_id"]

    group_service = GroupService(db_session)
    group_expense_service = GroupExpenseService(db_session)
    user_groups = group_service.list_groups_for_user(USER)

    result = _create_group_expense_from_agent(
        group_service, group_expense_service, user_groups, USER,
        group_name="Roommates", description="Pizza night", amount=60.0, category="Dining out",
        paid_by="Nobody",
    )

    assert "No member named" in result
    rows = db_session.execute(select(Expense).where(Expense.group_id.is_not(None))).scalars().all()
    assert len(rows) == 0


# --------------------------------------------------------------------------- #
# _resolve_payer
# --------------------------------------------------------------------------- #

def test_resolve_payer_unset_and_synonyms_default_to_caller():
    me = {"member_id": "m1", "display_name": "Me"}
    members = [me, {"member_id": "m2", "display_name": "Sam"}]
    for paid_by in (None, "", "me", "Me", "myself", "I"):
        payer, error = _resolve_payer(members, me, paid_by)
        assert error is None
        assert payer == me


def test_resolve_payer_matches_case_insensitive_substring():
    me = {"member_id": "m1", "display_name": "Me"}
    sam = {"member_id": "m2", "display_name": "Sam K"}
    payer, error = _resolve_payer([me, sam], me, "sam")
    assert error is None
    assert payer == sam


def test_create_group_expense_from_agent_unknown_group_returns_message_and_creates_nothing(db_session):
    group_service = GroupService(db_session)
    group_expense_service = GroupExpenseService(db_session)

    result = _create_group_expense_from_agent(
        group_service, group_expense_service, user_groups=[], actor_email=USER,
        group_name="Nonexistent Group", description="Dinner", amount=40.0, category="Dining out",
    )

    assert "No group found" in result
    rows = db_session.execute(select(Expense)).scalars().all()
    assert len(rows) == 0


def test_create_group_expense_from_agent_rejects_non_positive_amount(db_session):
    group_service = GroupService(db_session)
    group_expense_service = GroupExpenseService(db_session)
    user_groups = [{"group_id": "irrelevant", "name": "Roommates"}]

    result = _create_group_expense_from_agent(
        group_service, group_expense_service, user_groups, USER,
        group_name="Roommates", description="Nothing", amount=-5, category="Other",
    )

    assert result.startswith("Error")
