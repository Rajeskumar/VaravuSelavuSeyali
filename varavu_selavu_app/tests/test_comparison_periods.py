"""An in-progress month/year is compared with the same days of the previous one, not all of it."""
from datetime import date

import pytest

from varavu_selavu_service.services import insight_analytics_service as mod
from varavu_selavu_service.services.insight_analytics_service import InsightAnalyticsService


class _FixedDate(date):
    @classmethod
    def today(cls):
        return cls(2026, 10, 5)


@pytest.fixture
def svc(db_session, monkeypatch):
    monkeypatch.setattr(mod, "date", _FixedDate)
    return InsightAnalyticsService(db_session)


def test_current_month_compares_month_to_date(svc):
    assert svc._resolve_comparison_periods(None, None, 2026, 10) == (
        "2026-10-01", "2026-10-05", "2026-09-01", "2026-09-05")


def test_default_current_month_compares_month_to_date(svc):
    assert svc._resolve_comparison_periods(None, None, None, None, default_to_current_month=True) == (
        "2026-10-01", "2026-10-05", "2026-09-01", "2026-09-05")


def test_finished_month_compares_whole_months(svc):
    assert svc._resolve_comparison_periods(None, None, 2026, 9) == (
        "2026-09-01", "2026-09-30", "2026-08-01", "2026-08-31")


def test_current_year_compares_year_to_date(svc):
    assert svc._resolve_comparison_periods(None, None, 2026, None) == (
        "2026-01-01", "2026-10-05", "2025-01-01", "2025-10-05")


def test_custom_range_is_left_alone(svc):
    assert svc._resolve_comparison_periods("2026-10-01", "2026-10-31", None, None) == (
        "2026-10-01", "2026-10-31", "2026-08-31", "2026-09-30")
