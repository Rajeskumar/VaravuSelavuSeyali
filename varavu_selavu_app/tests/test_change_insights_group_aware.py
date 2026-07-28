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


def test_merchant_change_insight_not_fooled_by_casing_mismatch(db_session):
    # Same real merchant, same $60 spend both months — only the raw string
    # casing differs (an old receipt-scan entry from January saved it in caps).
    # `calculate_merchant_metrics`'s display name is MIN(merchant_name) *within
    # each period's own query*, so before the fix, Jan's query (only the caps
    # row in scope) reported "COSTCO" while Feb's query reported "Costco" —
    # two different dict keys, so Feb's diff lookup missed Jan's total entirely
    # and (since $60 clears the >$50 "New Merchant" threshold) reported this
    # unchanged, recurring merchant as a brand-new one with a 100% "increase".
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=None,
        purchased_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
        category_id="Food & Drink", amount=60.0, merchant_name="COSTCO",
    ))
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=None,
        purchased_at=datetime(2026, 2, 10, tzinfo=timezone.utc),
        category_id="Food & Drink", amount=60.0, merchant_name="Costco",
    ))
    db_session.commit()

    svc = InsightAnalyticsService(db=db_session)
    insights = svc.calculate_change_insights(user_id="test@user.com", year=2026, month=2)

    assert not any(i.time_scope == "merchant" for i in insights)


def test_merchant_change_insight_not_fooled_by_last_day_of_month_exclusion(db_session):
    # Same real merchant, same $500 spend both months, but the previous month's
    # transaction happens to land on its last calendar day (March has 31 days;
    # April, the current month, doesn't). `Expense.purchased_at` is a tz-aware
    # DateTime, but end-date filters were built from a plain 'YYYY-MM-DD'
    # string via `purchased_at <= end_date` — which Postgres reads as midnight
    # of that day. Any transaction recorded later that same day (this one is
    # at 6pm) failed the `<=` check, so the previous month's spend was silently
    # excluded whenever the recurring/merchant transaction date happened to
    # fall on the last day of a period — reporting a real, unchanged merchant
    # as a brand-new one with a 100% "increase".
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=None,
        purchased_at=datetime(2026, 3, 31, 18, 0, tzinfo=timezone.utc),
        category_id="Bills", amount=500.0, merchant_name="DCU",
    ))
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=None,
        purchased_at=datetime(2026, 4, 15, 18, 0, tzinfo=timezone.utc),
        category_id="Bills", amount=500.0, merchant_name="DCU",
    ))
    db_session.commit()

    svc = InsightAnalyticsService(db=db_session)
    insights = svc.calculate_change_insights(user_id="test@user.com", year=2026, month=4)

    assert not any(i.time_scope == "merchant" for i in insights)


def test_change_insights_deduped_across_sections_by_entity_name(db_session):
    # Same recurring bill, same amount as last month ($30 -> $60, a real
    # $30/100% increase) — but its description also matches its merchant_name,
    # so both the "Biggest Merchant Increase" section and the "Recurring Bill
    # Increase" section independently compute the same change from the same
    # rows and would each contribute a card. The rendered headline is built
    # from entity_name alone, so both cards read identically — the same
    # change must only be reported once.
    from varavu_selavu_service.db.models import RecurringTemplate

    db_session.add(RecurringTemplate(
        id=uuid.uuid4(), user_email="test@user.com", description="Mobile recharge",
        category="Bills", merchant_name="Mobile recharge", day_of_month=10,
        default_cost=60.0, start_date=datetime(2026, 1, 1).date(), status="Active",
    ))
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=None,
        purchased_at=datetime(2026, 1, 10, tzinfo=timezone.utc),
        category_id="Bills", amount=30.0, description="Mobile recharge", merchant_name="Mobile recharge",
    ))
    db_session.add(Expense(
        id=uuid.uuid4(), user_email="test@user.com", group_id=None,
        purchased_at=datetime(2026, 2, 10, tzinfo=timezone.utc),
        category_id="Bills", amount=60.0, description="Mobile recharge", merchant_name="Mobile recharge",
    ))
    db_session.commit()

    svc = InsightAnalyticsService(db=db_session)
    insights = svc.calculate_change_insights(user_id="test@user.com", year=2026, month=2)

    matching = [i for i in insights if i.entity_name == "Mobile recharge"]
    assert len(matching) == 1


def test_group_scope_suffix_only_shown_to_group_members(db_session):
    svc = InsightAnalyticsService(db=db_session)
    assert svc._group_scope_suffix("test@user.com") == ""

    _seed_group(db_session)
    assert "group expenses" in svc._group_scope_suffix("test@user.com")
