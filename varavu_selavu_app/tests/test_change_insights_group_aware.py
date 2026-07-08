import os
import uuid
from datetime import datetime, timezone

import pytest

from varavu_selavu_service.db.models import Expense, Group, GroupMember
from varavu_selavu_service.services.insight_analytics_service import InsightAnalyticsService


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


def _seed_group(db_session, name="Trip"):
    group = Group(id=uuid.uuid4(), name=name, created_by="test@user.com")
    db_session.add(group)
    db_session.flush()
    member = GroupMember(
        id=uuid.uuid4(), group_id=group.id, user_email="test@user.com",
        display_name="Test User", role="admin", status="active",
        joined_at=datetime.now(timezone.utc),
    )
    db_session.add(member)
    db_session.commit()
    return group


def test_category_insight_not_double_counted_by_group_expense(db_session):
    # Previous period (Jan 2026): $10 personal spend in Food & Drink.
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=None,
        purchased_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
        category_id="Food & Drink", amount=10.0, description="Groceries",
    ))
    # Current period (Feb 2026): $50 personal spend in Food & Drink (real $40 increase).
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=None,
        purchased_at=datetime(2026, 2, 10, tzinfo=timezone.utc),
        category_id="Food & Drink", amount=50.0, description="Groceries",
    ))
    # A group expense the same user authored, same category/period, much larger —
    # must NOT be folded into the personal category total (the bug this fixes).
    group = _seed_group(db_session)
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=group.id,
        purchased_at=datetime(2026, 2, 12, tzinfo=timezone.utc),
        category_id="Food & Drink", amount=500.0, description="Group dinner",
    ))
    db_session.commit()

    svc = InsightAnalyticsService(db=db_session)
    insights = svc.calculate_change_insights(user_id="test@user.com", year=2026, month=2)

    category_insight = next(i for i in insights if i.time_scope == "category")
    assert category_insight.current_value == 50.0
    assert category_insight.change_amount == 40.0


def test_merchant_metrics_exclude_group_expenses(db_session):
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=None,
        purchased_at=datetime(2026, 2, 5, tzinfo=timezone.utc),
        category_id="Food & Drink", amount=25.0, merchant_name="Costco",
    ))
    group = _seed_group(db_session)
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=group.id,
        purchased_at=datetime(2026, 2, 6, tzinfo=timezone.utc),
        category_id="Food & Drink", amount=999.0, merchant_name="Costco",
    ))
    db_session.commit()

    svc = InsightAnalyticsService(db=db_session)
    results = svc.calculate_merchant_metrics(user_id="test@user.com", year=2026, month=2)

    costco = next(r for r in results if r.merchant_name == "Costco")
    assert costco.total_spent == 25.0


def test_group_scope_suffix_only_shown_to_group_members(db_session):
    svc = InsightAnalyticsService(db=db_session)
    assert svc._group_scope_suffix("test@user.com") == ""

    _seed_group(db_session)
    assert "group expenses" in svc._group_scope_suffix("test@user.com")
