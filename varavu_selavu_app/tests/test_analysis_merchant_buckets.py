"""tests/test_analysis_merchant_buckets.py — TS-CARD-113 (category, merchant) cross-tab.

Covers AnalysisService.compute_category_merchant_buckets directly against a real DB session —
the foundation CardRewardsEngine's merchant-vs-category precedence resolution depends on.
"""
import os
import uuid
from datetime import datetime

import pytest

from varavu_selavu_service.db.models import Expense, Group, GroupMember, User
from varavu_selavu_service.services.analysis_service import AnalysisService


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


def test_buckets_split_by_category_and_merchant(db_session):
    db_session.add_all([
        Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Electronics", merchant_name="Apple", amount=100.0, description="iPhone case"),
        Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 6), category_id="Electronics", merchant_name="Best Buy", amount=50.0, description="Cable"),
        Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 7), category_id="Groceries", merchant_name="Apple", amount=10.0, description="Weird but possible"),
    ])
    db_session.commit()

    svc = AnalysisService(db_session)
    buckets = svc.compute_category_merchant_buckets("test@user.com", year=2026, month=1)

    by_key = {(b["category"], b["merchant"]): b["total"] for b in buckets}
    assert by_key[("Electronics", "Apple")] == 100.0
    assert by_key[("Electronics", "Best Buy")] == 50.0
    assert by_key[("Groceries", "Apple")] == 10.0


def test_buckets_handle_missing_merchant_as_none(db_session):
    db_session.add(Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Dining out", merchant_name=None, amount=30.0, description="Cash tip jar"))
    db_session.commit()

    svc = AnalysisService(db_session)
    buckets = svc.compute_category_merchant_buckets("test@user.com", year=2026, month=1)

    assert any(b["category"] == "Dining out" and b["merchant"] is None and b["total"] == 30.0 for b in buckets)


def test_buckets_exclude_group_spend_by_default(db_session, test_client):
    group_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = group_res.json()["group_id"]
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    member = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com").first()
    test_client.post(f"/api/v1/groups/{group_id}/expenses", json={
        "date": "01/05/2026", "description": "Hotel", "category": "Travel", "amount": 200.0,
        "payers": [{"member_id": str(member.id), "amount_paid": 200.0}],
        "split": {"type": "equal", "entries": [{"member_id": str(member.id)}]},
    })
    AnalysisService(db_session).invalidate_cache()

    svc = AnalysisService(db_session)
    buckets = svc.compute_category_merchant_buckets("test@user.com", year=2026, month=1, include_group_i_paid=False)
    assert buckets == []


def test_buckets_include_full_amount_paid_for_group_spend_when_enabled(db_session, test_client):
    """The core TS-CARD-105-style assertion, now for merchant buckets: group spend must use the
    full amount the user paid, never the split "my share"."""
    db_session.add(User(id=uuid.uuid4(), email="b@test.com", password_hash="hash", name="B"))
    db_session.commit()

    group_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = group_res.json()["group_id"]
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    admin_member = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com").first()
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "b@test.com"})
    b_member_id = member_res.json()["member_id"]

    test_client.post(f"/api/v1/groups/{group_id}/expenses", json={
        "date": "01/05/2026", "description": "Hotel", "category": "Hotel", "amount": 200.0,
        "payers": [{"member_id": str(admin_member.id), "amount_paid": 200.0}],
        "split": {"type": "equal", "entries": [{"member_id": str(admin_member.id)}, {"member_id": b_member_id}]},
    })
    AnalysisService(db_session).invalidate_cache()

    svc = AnalysisService(db_session)
    buckets = svc.compute_category_merchant_buckets("test@user.com", year=2026, month=1, include_group_i_paid=True)
    hotel_bucket = next(b for b in buckets if b["category"] == "Hotel")
    assert hotel_bucket["total"] == 200.0  # full amount paid, not the $100 split share
