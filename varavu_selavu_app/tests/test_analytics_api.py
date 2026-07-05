import pytest
import os
import uuid
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from unittest.mock import patch

# Ensure we use an in-memory db for these unit tests if not specified
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from varavu_selavu_service.main import app
from varavu_selavu_service.db.session import Base, get_db
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import User, Expense, ExpenseItem, ItemInsight, MerchantInsight, Group, GroupMember
from varavu_selavu_service.services.analysis_service import AnalysisService

@pytest.fixture(scope="function")
def analytics_db_session(db_session):
    db = db_session
    
    # Seed Data for Dynamic Retrieval
    e1 = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        merchant_name="Walmart",
        amount=150.0,
        category_id="Shopping",
        purchased_at=datetime.datetime(2023, 5, 10)
    )
    db.add(e1)

    i1 = ExpenseItem(
        id=uuid.uuid4(),
        expense_id=e1.id,
        user_email="test@user.com",
        line_no=1,
        item_name="Apples",
        normalized_name="Apples",
        unit_price=2.0,
        quantity=10,
        line_total=20.0
    )
    db.add(i1)

    # Seed ItemInsights
    item1 = ItemInsight(id=uuid.uuid4(), user_email="test@user.com", normalized_name="Apples", avg_unit_price=2.0, min_price=1.5, max_price=2.5, total_quantity_bought=10, total_spent=20.0)
    db.add(item1)
    
    # Seed MerchantInsights
    merchant1 = MerchantInsight(id=uuid.uuid4(), user_email="test@user.com", merchant_name="Walmart", total_spent=150.0, transaction_count=5)
    db.add(merchant1)
    
    db.commit()
    db.commit()
    yield db

def test_get_top_items(test_client, analytics_db_session):
    response = test_client.get("/api/v1/analytics/items?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["normalized_name"] == "Apples" or data[0]["item_name"] == "Apples"

def test_get_item_detail(test_client, analytics_db_session):
    response = test_client.get("/api/v1/analytics/items/Apples?user_id=test@user.com")
    assert response.status_code == 200
    data = response.json()
    assert data["normalized_name"] == "Apples" or data["item_name"] == "Apples"
    assert "price_history" in data
    assert "store_comparison" in data
    
def test_get_top_merchants(test_client, analytics_db_session):
    response = test_client.get("/api/v1/analytics/merchants?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["merchant_name"] == "Walmart"

def test_get_merchant_detail(test_client, analytics_db_session):
    response = test_client.get("/api/v1/analytics/merchants/Walmart?user_id=test@user.com")
    assert response.status_code == 200
    data = response.json()
    assert data["merchant_name"] == "Walmart"
    assert "monthly_aggregates" in data
    assert "items_bought" in data

@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_analysis_chat_with_item_intent(mock_call_chat_model, test_client, analytics_db_session):
    mock_call_chat_model.return_value = "Apples cost $2.00 on average."
    # Asking about an item should trigger the item intent
    response = test_client.post(
        "/api/v1/analysis/chat",
        json={
            "user_id": "test@user.com",
            "query": "How much are apples?",
            "year": 2023,
            "month": 5
        }
    )
    # Testing that it returns 200 and a chat response is enough,
    # as the actual LLM call might be mocked or return a generated string based on context
    assert response.status_code == 200
    assert "response" in response.json()

@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_analysis_chat_with_merchant_intent(mock_call_chat_model, test_client, analytics_db_session):
    mock_call_chat_model.return_value = "You spent $150.0 at Walmart."
    # Asking about a merchant should trigger the merchant intent
    response = test_client.post(
        "/api/v1/analysis/chat",
        json={
            "user_id": "test@user.com",
            "query": "How much did I spend at Walmart?",
        }
    )
    assert response.status_code == 200
    assert "response" in response.json()


# ---------------------------------------------------------------------------
# TS-GRP-106: scope-aware /analysis + group_id IS NULL double-count guard
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=False)
def _groups_enabled_for_scope_tests():
    old_val = os.environ.get("GROUPS_ENABLED")
    os.environ["GROUPS_ENABLED"] = "true"
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["GROUPS_ENABLED"] = old_val
        else:
            os.environ.pop("GROUPS_ENABLED", None)


def _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=1):
    """test@user.com (default auth override) has a $50 personal expense and authors a
    $90 group expense (equal split with b@test.com -> $45 each, test@user.com pays 90).
    Returns (group_id, member_ids: {email: member_id})."""
    db_session.add(Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        purchased_at=datetime.datetime(year, month, 5),
        category_id="Shopping",
        amount=50.00,
        description="Solo purchase",
    ))
    db_session.commit()

    db_session.add(User(id=uuid.uuid4(), email="b@test.com", password_hash="hash", name="B"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]

    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    admin_member = db_session.query(GroupMember).filter(
        GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com"
    ).first()
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "b@test.com"})
    member_ids = {"test@user.com": str(admin_member.id), "b@test.com": member_res.json()["member_id"]}

    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": f"{month:02d}/05/{year}",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": member_ids["test@user.com"], "amount_paid": 90.00}],
            "split": {
                "type": "equal",
                "entries": [{"member_id": member_ids["test@user.com"]}, {"member_id": member_ids["b@test.com"]}],
            },
        },
    )

    AnalysisService(db_session).invalidate_cache()
    return group_id, member_ids


def test_analysis_legacy_no_scope_param_defaults_to_personal(test_client, db_session, _groups_enabled_for_scope_tests):
    """§13 back-compat: old clients that never send `scope` keep seeing personal-only
    totals, and the response validates against AnalysisResponse unchanged."""
    _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=2)

    res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 2})
    assert res.status_code == 200
    body = res.json()
    assert body["total_expenses"] == 50.00
    assert body["scope"] == "personal"
    assert body["spend_breakdown"] is None
    assert body["group_summaries"] is None


def test_analysis_scope_personal_excludes_group_expense_double_count_regression(test_client, db_session, _groups_enabled_for_scope_tests):
    """The group expense is authored by test@user.com (expenses.user_email=creator).
    Without the group_id IS NULL guard this would double-count the full $90 on top of
    personal spend. scope=personal must show only the $50 personal expense."""
    _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=3)

    res = test_client.get("/api/v1/analysis", params={"scope": "personal", "year": 2026, "month": 3})
    assert res.status_code == 200
    body = res.json()
    assert body["total_expenses"] == 50.00
    assert "Food & Drink" not in {c["category"] for c in body["category_totals"]}


def test_analysis_scope_combined_sums_personal_plus_my_share(test_client, db_session, _groups_enabled_for_scope_tests):
    _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=4)

    res = test_client.get("/api/v1/analysis", params={"scope": "combined", "year": 2026, "month": 4})
    assert res.status_code == 200
    body = res.json()

    assert body["total_expenses"] == 95.00  # 50 personal + 45 my share (never the full $90)
    assert body["spend_breakdown"]["personal"] == 50.00
    assert body["spend_breakdown"]["group_share"] == 45.00
    assert round(body["spend_breakdown"]["personal"] + body["spend_breakdown"]["group_share"], 2) == body["total_expenses"]


def test_analysis_scope_groups_shows_shares_only(test_client, db_session, _groups_enabled_for_scope_tests):
    _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=5)

    res = test_client.get("/api/v1/analysis", params={"scope": "groups", "year": 2026, "month": 5})
    assert res.status_code == 200
    body = res.json()
    assert body["total_expenses"] == 45.00  # my share only, not the personal $50 or the full $90


def test_analysis_group_summaries_correct_for_combined(test_client, db_session, _groups_enabled_for_scope_tests):
    group_id, member_ids = _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=6)

    res = test_client.get("/api/v1/analysis", params={"scope": "combined", "year": 2026, "month": 6})
    assert res.status_code == 200
    summaries = res.json()["group_summaries"]
    assert len(summaries) == 1
    summary = summaries[0]
    assert summary["group_id"] == group_id
    assert summary["name"] == "Trip"
    assert summary["my_share"] == 45.00
    assert summary["i_paid"] == 90.00
    assert summary["group_total"] == 90.00
    # net(m) = paid - owed + settlements_sent - settlements_received = 90 - 45 = 45
    assert summary["my_balance"] == 45.00


def test_analysis_group_id_filter_restricts_to_one_group(test_client, db_session, _groups_enabled_for_scope_tests):
    group_id, member_ids = _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=7)

    res = test_client.get(
        "/api/v1/analysis", params={"scope": "groups", "year": 2026, "month": 7, "group_id": group_id}
    )
    assert res.status_code == 200
    assert res.json()["total_expenses"] == 45.00

    bogus_res = test_client.get(
        "/api/v1/analysis",
        params={"scope": "groups", "year": 2026, "month": 7, "group_id": str(uuid.uuid4())},
    )
    assert bogus_res.status_code == 200
    assert bogus_res.json()["total_expenses"] == 0.0


def test_analysis_cache_distinguishes_scope_and_group_id(test_client, db_session, _groups_enabled_for_scope_tests):
    """Two requests differing only in scope (or group_id) must not collide in the cache."""
    _seed_personal_and_group_scenario(test_client, db_session, year=2026, month=8)

    personal = test_client.get("/api/v1/analysis", params={"scope": "personal", "year": 2026, "month": 8})
    combined = test_client.get("/api/v1/analysis", params={"scope": "combined", "year": 2026, "month": 8})
    groups = test_client.get("/api/v1/analysis", params={"scope": "groups", "year": 2026, "month": 8})

    totals = {
        "personal": personal.json()["total_expenses"],
        "combined": combined.json()["total_expenses"],
        "groups": groups.json()["total_expenses"],
    }
    assert totals["personal"] == 50.00
    assert totals["combined"] == 95.00
    assert totals["groups"] == 45.00
    assert len(set(totals.values())) == 3  # all distinct — no cache-key collision
