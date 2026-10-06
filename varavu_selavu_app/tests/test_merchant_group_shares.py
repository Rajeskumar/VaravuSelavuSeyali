"""Month-scoped merchant insights include the user's share of group expenses (landing-page promise)."""
import os
import uuid

import pytest

from varavu_selavu_service.db.models import GroupMember, User
from varavu_selavu_service.services.insight_analytics_service import InsightAnalyticsService


@pytest.fixture(autouse=True)
def _groups_enabled(monkeypatch):
    monkeypatch.setenv("GROUPS_ENABLED", "true")


def _group_with_rent_and_airbnb(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="b@test.com", password_hash="h", name="b"))
    db_session.commit()
    gid = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
    other = test_client.post(f"/api/v1/groups/{gid}/members", json={"email": "b@test.com"}).json()["member_id"]
    me = str(db_session.query(GroupMember).filter(GroupMember.user_email == "test@user.com").one().id)
    res = test_client.post(f"/api/v1/groups/{gid}/expenses", json={
        "date": "09/19/2026", "description": "Cabin", "category": "Hotel", "amount": 860.0, "merchant_name": "Airbnb",
        "payers": [{"member_id": me, "amount_paid": 860.0}],
        "split": {"type": "equal", "entries": [{"member_id": me}, {"member_id": other}]},
    })
    assert res.status_code == 201, res.text
    test_client.post("/api/v1/expenses", json={
        "user_id": "test@user.com", "cost": 40.0, "category": "Groceries", "description": "Snacks",
        "date": "09/20/2026", "merchant_name": "Costco"})


def test_month_view_includes_group_share_not_full_amount(test_client, db_session):
    _group_with_rent_and_airbnb(test_client, db_session)
    svc = InsightAnalyticsService(db_session)
    rows = {m.merchant_name: m.total_spent for m in svc.calculate_merchant_metrics("test@user.com", year=2026, month=9)}
    assert rows == {"Airbnb": 430.0, "Costco": 40.0}


def test_merchant_detail_works_for_a_group_only_merchant(test_client, db_session):
    _group_with_rent_and_airbnb(test_client, db_session)
    detail = InsightAnalyticsService(db_session).calculate_merchant_detail("test@user.com", "Airbnb", year=2026, month=9)
    assert detail is not None
    assert detail["total_spent"] == 430.0
    assert detail["recent_transactions"][0]["amount"] == 430.0
    assert detail["spend_share_percent"] == round(430 / 470 * 100, 1)
