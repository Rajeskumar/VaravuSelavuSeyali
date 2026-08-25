"""tests/test_tags_analysis_filter.py — TS-TAG-106: tag_ids on GET /analysis and GET /expenses,
share-aware my_expenses_total/i_paid_total (PRD §10.4)."""
import os
import uuid
from datetime import datetime

import pytest

from varavu_selavu_service.db.models import Expense, Group, GroupMember, User
from varavu_selavu_service.services.analysis_service import AnalysisService


@pytest.fixture(autouse=True)
def _tags_and_groups_enabled():
    old_tags = os.environ.get("TAGS_ENABLED")
    old_groups = os.environ.get("GROUPS_ENABLED")
    os.environ["TAGS_ENABLED"] = "true"
    os.environ["GROUPS_ENABLED"] = "true"
    try:
        yield
    finally:
        for key, old in (("TAGS_ENABLED", old_tags), ("GROUPS_ENABLED", old_groups)):
            if old is not None:
                os.environ[key] = old
            else:
                os.environ.pop(key, None)


def _seed_two_member_group_with_expense(test_client, db_session, amount=90.0):
    db_session.add(User(id=uuid.uuid4(), email="b@test.com", password_hash="hash", name="B"))
    db_session.commit()
    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    admin_member = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com").first()
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "b@test.com"})
    member_ids = {"test@user.com": str(admin_member.id), "b@test.com": member_res.json()["member_id"]}
    expense_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/06/2026", "description": "Dinner", "category": "Food & Drink", "amount": amount,
            "payers": [{"member_id": member_ids["test@user.com"], "amount_paid": amount}],
            "split": {"type": "equal", "entries": [{"member_id": member_ids["test@user.com"]}, {"member_id": member_ids["b@test.com"]}]},
        },
    )
    return group_id, expense_res.json()["expense"]["row_id"]


# ─── GET /expenses?tag_ids= ────────────────────────────────


def test_get_expenses_filters_by_tag_ids(test_client, db_session):
    tag_a = test_client.post("/api/v1/tags", json={"name": "A"}).json()
    tag_b = test_client.post("/api/v1/tags", json={"name": "B"}).json()
    exp1 = test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 10, "category": "Shopping", "description": "One", "date": "08/15/2026", "tag_names": ["A"]}).json()["expense"]
    exp2 = test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 20, "category": "Shopping", "description": "Two", "date": "08/15/2026", "tag_names": ["B"]}).json()["expense"]
    test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 30, "category": "Shopping", "description": "Three", "date": "08/15/2026"})

    res = test_client.get("/api/v1/expenses", params={"tag_ids": [tag_a["id"]]})
    descriptions = [r["description"] for r in res.json()["items"]]
    assert descriptions == ["One"]


def test_get_expenses_tag_ids_or_semantics(test_client, db_session):
    tag_a = test_client.post("/api/v1/tags", json={"name": "A"}).json()
    tag_b = test_client.post("/api/v1/tags", json={"name": "B"}).json()
    test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 10, "category": "Shopping", "description": "One", "date": "08/15/2026", "tag_names": ["A"]})
    test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 20, "category": "Shopping", "description": "Two", "date": "08/15/2026", "tag_names": ["B"]})
    test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 30, "category": "Shopping", "description": "Three", "date": "08/15/2026"})

    res = test_client.get("/api/v1/expenses", params={"tag_ids": [tag_a["id"], tag_b["id"]]})
    descriptions = {r["description"] for r in res.json()["items"]}
    assert descriptions == {"One", "Two"}


def test_get_expenses_without_tag_ids_returns_everything(test_client, db_session):
    test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 10, "category": "Shopping", "description": "One", "date": "08/15/2026"})
    res = test_client.get("/api/v1/expenses")
    assert len(res.json()["items"]) == 1


# ─── GET /analysis?tag_ids= ────────────────────────────────


def test_analysis_tag_filter_scopes_category_totals(test_client, db_session):
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 40, "category": "Groceries", "description": "Tagged", "date": "01/15/2026", "tag_names": ["Trip 1"]})
    test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 60, "category": "Shopping", "description": "Untagged", "date": "01/15/2026"})
    AnalysisService(db_session).invalidate_cache()

    res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "tag_ids": [tag["id"]]})
    body = res.json()
    assert body["total_expenses"] == 40.0
    assert body["category_totals"] == [{"category": "Groceries", "total": 40.0}]


def test_analysis_without_tag_ids_has_null_share_totals(test_client, db_session):
    test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 40, "category": "Groceries", "description": "X", "date": "01/15/2026"})
    AnalysisService(db_session).invalidate_cache()

    res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1})
    body = res.json()
    assert body["my_expenses_total"] is None
    assert body["i_paid_total"] is None


def test_analysis_tag_filter_my_expenses_total_is_share_aware(test_client, db_session):
    """The core PRD §4.1 differentiator: My Expenses = personal + my computed share of tagged
    group expenses, using the SAME split rows the rest of the app already computes from."""
    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session, amount=90.0)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    test_client.post(f"/api/v1/expenses/{expense_id}/tags", json={"tag_ids": [tag["id"]]})
    test_client.post("/api/v1/expenses", json={"user_id": "test@user.com", "cost": 10, "category": "Shopping", "description": "Solo", "date": "01/07/2026", "tag_names": ["Trip 1"]})
    AnalysisService(db_session).invalidate_cache()

    res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "tag_ids": [tag["id"]]})
    body = res.json()
    assert body["my_expenses_total"] == 55.0  # $10 personal + $45 (half of $90 equal split)
    assert body["i_paid_total"] == 100.0  # $10 personal + $90 (fully paid by test@user.com)


def test_analysis_tag_filter_excludes_untagged_group_expenses(test_client, db_session):
    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session, amount=90.0)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    # Deliberately NOT tagging the group expense.
    AnalysisService(db_session).invalidate_cache()

    res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "tag_ids": [tag["id"]]})
    body = res.json()
    assert body["my_expenses_total"] == 0.0
    assert body["i_paid_total"] == 0.0


def test_analysis_tag_filter_never_leaks_another_members_private_tag(test_client, db_session):
    """G7/§9.2: filtering /analysis by MY tag must never surface an expense purely because a
    different member privately tagged it with a similarly-named tag of their own."""
    from varavu_selavu_service.services.tag_service import TagService

    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session, amount=90.0)
    b_tag_svc = TagService(db_session)
    b_tag, _ = b_tag_svc.create_tag("b@test.com", "Trip 1")
    b_tag_svc.apply_tags_to_expense("b@test.com", expense_id, tag_ids=[str(b_tag.id)])
    AnalysisService(db_session).invalidate_cache()

    my_tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "tag_ids": [my_tag["id"]]})
    assert res.json()["my_expenses_total"] == 0.0  # my tag ID differs from b's tag ID; no leak
