"""P2-5: personal-ledger CSV export, with the same injection guard as the group export."""

import csv
import io
import uuid
from datetime import datetime

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import Expense, User
from varavu_selavu_service.main import app


def _add_expense(db_session, *, email="test@user.com", description="Coffee", category="Food",
                 amount=4.50, when=datetime(2026, 1, 15), merchant=None, group_id=None):
    db_session.add(
        Expense(
            id=uuid.uuid4(),
            user_email=email,
            purchased_at=when,
            category_id=category,
            amount=amount,
            description=description,
            merchant_name=merchant,
            group_id=group_id,
        )
    )
    db_session.commit()


def _rows(test_client, params=None):
    res = test_client.get("/api/v1/expenses/export.csv", params=params or {})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/csv")
    return list(csv.reader(io.StringIO(res.text.lstrip("﻿"))))


def test_export_has_a_header_even_when_empty(test_client, db_session):
    rows = _rows(test_client)
    assert rows[0] == ["date", "description", "category", "merchant", "amount", "item_count"]
    assert len(rows) == 1


def test_export_includes_the_users_expenses(test_client, db_session):
    _add_expense(db_session, description="Coffee", merchant="Blue Bottle", amount=4.50)
    rows = _rows(test_client)
    assert len(rows) == 2
    assert rows[1][1] == "Coffee"
    assert rows[1][3] == "Blue Bottle"
    assert rows[1][4] == "4.5"


def test_export_is_scoped_to_the_caller(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@test.com", password_hash="h", name="O"))
    db_session.commit()
    _add_expense(db_session, email="other@test.com", description="NOT MINE")
    _add_expense(db_session, description="Mine")

    rows = _rows(test_client)
    descriptions = [r[1] for r in rows[1:]]
    assert "Mine" in descriptions
    assert "NOT MINE" not in descriptions


def test_export_requires_authentication(test_client, db_session):
    saved = app.dependency_overrides.pop(auth_required, None)
    test_client.cookies.clear()
    try:
        assert test_client.get("/api/v1/expenses/export.csv").status_code == 401
    finally:
        if saved is not None:
            app.dependency_overrides[auth_required] = saved


def test_export_is_newest_first(test_client, db_session):
    _add_expense(db_session, description="Older", when=datetime(2026, 1, 1))
    _add_expense(db_session, description="Newer", when=datetime(2026, 3, 1))
    rows = _rows(test_client)
    assert [r[1] for r in rows[1:]] == ["Newer", "Older"]


def test_export_respects_the_date_range(test_client, db_session):
    _add_expense(db_session, description="Before", when=datetime(2026, 1, 1))
    _add_expense(db_session, description="Inside", when=datetime(2026, 2, 15))
    _add_expense(db_session, description="After", when=datetime(2026, 3, 20))

    rows = _rows(test_client, {"start_date": "02/01/2026", "end_date": "02/28/2026"})
    assert [r[1] for r in rows[1:]] == ["Inside"]


@pytest.mark.parametrize("payload", ["=cmd|'/c calc'!A1", "=1+1", "+1", "-1+1", "@SUM(A1)"])
def test_formula_injection_is_neutralized(test_client, db_session, payload):
    """Same guard as the group export (P0-1)."""
    _add_expense(db_session, description=payload)
    rows = _rows(test_client)
    assert rows[1][1] == "'" + payload


def test_numeric_amount_cell_is_not_quoted(test_client, db_session):
    _add_expense(db_session, amount=12.34)
    rows = _rows(test_client)
    assert rows[1][4] == "12.34"


def test_ordinary_description_is_untouched(test_client, db_session):
    _add_expense(db_session, description="Dinner at Joe's")
    rows = _rows(test_client)
    assert rows[1][1] == "Dinner at Joe's"
