"""Allowed date window for an expense a person enters (product decision, 2026-11-22).

* No future dates. Scheduled/future spend is what Recurring is for.
* Nothing older than one year. Older history is out of scope for now (see ROADMAP).

The window is judged against the UTC date with one day of slack on each side so a person in a
timezone ahead of or behind UTC is never rejected for "today". Only the user-facing write paths
call this: recurring auto-add, imports and tests go through the services directly.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional, Union

from fastapi import HTTPException

FUTURE_MESSAGE = "Expense date can't be in the future. Use a recurring expense for upcoming bills."
TOO_OLD_MESSAGE = "Expense date can't be more than a year ago."
_SLACK = timedelta(days=1)
_MAX_AGE = timedelta(days=365)


def _today() -> date:
    """Seam for tests (pinned in tests/conftest.py so fixed fixture dates stay valid)."""
    return datetime.now(timezone.utc).date()


def _as_date(value: Union[str, date, datetime]) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value)[:10]
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError("invalid date")


def date_problem(value, *, check_past: bool = True, today: Optional[date] = None) -> Optional[str]:
    """Return the user-facing reason `value` is outside the window, or None if it is fine."""
    try:
        d = _as_date(value)
    except ValueError:
        return None  # format errors are reported by the field's own pattern
    now = today or _today()
    if d > now + _SLACK:
        return FUTURE_MESSAGE
    if check_past and d < now - _MAX_AGE - _SLACK:
        return TOO_OLD_MESSAGE
    return None


def check_future(value: str) -> str:
    """Pydantic validator: future dates are never allowed (also on edits)."""
    problem = date_problem(value, check_past=False)
    if problem:
        raise ValueError(problem)
    return value


def assert_expense_date(value, *, check_past: bool = True) -> None:
    problem = date_problem(value, check_past=check_past)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
