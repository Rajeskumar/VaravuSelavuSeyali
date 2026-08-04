"""Server-side money bounds (P1-3): the client is not trusted.

Amounts must be > 0, <= MAX_AMOUNT, and carry at most 2 decimal places.
"""

import os
import uuid
from decimal import Decimal

import pytest

from varavu_selavu_service.core.money import MAX_AMOUNT
from varavu_selavu_service.db.models import Group, GroupMember, User


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


REJECTED_AMOUNTS = [
    pytest.param(0, id="zero"),
    pytest.param(-1, id="negative"),
    pytest.param(-0.01, id="negative-cent"),
    pytest.param(999999999999, id="the-audit-value"),
    pytest.param(float(MAX_AMOUNT) + 1, id="just-over-max"),
    pytest.param(10.999, id="three-decimals"),
    pytest.param(306.49999999999994, id="float-noise"),
]


class TestPersonalExpenseAmount:
    @pytest.mark.parametrize("cost", REJECTED_AMOUNTS)
    def test_rejects_out_of_range_cost(self, test_client, db_session, cost):
        res = test_client.post(
            "/api/v1/expenses",
            json={
                "user_id": "test@user.com", "cost": cost, "category": "Food",
                "description": "Dinner", "date": "01/15/2026",
            },
        )
        assert res.status_code == 422, res.text

    @pytest.mark.parametrize("cost", [0.01, 1, 10.5, float(MAX_AMOUNT)])
    def test_accepts_in_range_cost(self, test_client, db_session, cost):
        res = test_client.post(
            "/api/v1/expenses",
            json={
                "user_id": "test@user.com", "cost": cost, "category": "Food",
                "description": "Dinner", "date": "01/15/2026",
            },
        )
        assert res.status_code < 400, res.text

    def test_error_message_names_the_constraint(self, test_client, db_session):
        res = test_client.post(
            "/api/v1/expenses",
            json={
                "user_id": "test@user.com", "cost": 0, "category": "Food",
                "description": "Dinner", "date": "01/15/2026",
            },
        )
        assert res.status_code == 422
        assert "greater than 0" in res.text


class TestGroupExpenseAmount:
    @staticmethod
    def _group(test_client, db_session):
        group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
        member = (
            db_session.query(GroupMember)
            .filter(GroupMember.group_id == uuid.UUID(group_id), GroupMember.user_email == "test@user.com")
            .first()
        )
        return group_id, str(member.id)

    @pytest.mark.parametrize("amount", REJECTED_AMOUNTS)
    def test_rejects_out_of_range_amount(self, test_client, db_session, amount):
        group_id, member_id = self._group(test_client, db_session)
        res = test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026", "description": "Dinner", "category": "Food",
                "amount": amount,
                "payers": [{"member_id": member_id, "amount_paid": amount}],
                "split": {"type": "equal", "entries": [{"member_id": member_id}]},
            },
        )
        assert res.status_code == 422, res.text

    def test_rejects_negative_payer_amount(self, test_client, db_session):
        group_id, member_id = self._group(test_client, db_session)
        res = test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026", "description": "Dinner", "category": "Food",
                "amount": 10.00,
                "payers": [{"member_id": member_id, "amount_paid": -10.00}],
                "split": {"type": "equal", "entries": [{"member_id": member_id}]},
            },
        )
        assert res.status_code == 422, res.text

    def test_split_shares_must_sum_to_the_amount(self, test_client, db_session):
        """Already enforced by the split engine — locked in here as a regression."""
        group_id, member_id = self._group(test_client, db_session)
        res = test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026", "description": "Dinner", "category": "Food",
                "amount": 100.00,
                "payers": [{"member_id": member_id, "amount_paid": 100.00}],
                "split": {"type": "exact", "entries": [{"member_id": member_id, "value": 99.00}]},
            },
        )
        assert res.status_code == 400, res.text

    def test_payers_must_sum_to_the_amount(self, test_client, db_session):
        group_id, member_id = self._group(test_client, db_session)
        res = test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026", "description": "Dinner", "category": "Food",
                "amount": 100.00,
                "payers": [{"member_id": member_id, "amount_paid": 50.00}],
                "split": {"type": "equal", "entries": [{"member_id": member_id}]},
            },
        )
        assert res.status_code == 400, res.text

    def test_amount_is_stored_as_exact_decimal(self, test_client, db_session):
        """A cent value must round-trip without float drift."""
        from varavu_selavu_service.db.models import Expense

        group_id, member_id = self._group(test_client, db_session)
        res = test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026", "description": "Dinner", "category": "Food",
                "amount": 306.50,
                "payers": [{"member_id": member_id, "amount_paid": 306.50}],
                "split": {"type": "equal", "entries": [{"member_id": member_id}]},
            },
        )
        assert res.status_code == 201, res.text
        stored = db_session.query(Expense).filter(Expense.group_id == uuid.UUID(group_id)).first()
        assert stored.amount == Decimal("306.50")


class TestSettlementAmount:
    @pytest.mark.parametrize("amount", REJECTED_AMOUNTS)
    def test_rejects_out_of_range_amount(self, test_client, db_session, amount):
        db_session.add(User(id=uuid.uuid4(), email="b@test.com", password_hash="h", name="B"))
        db_session.commit()
        group_id = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
        other = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "b@test.com"}).json()["member_id"]
        mine = (
            db_session.query(GroupMember)
            .filter(GroupMember.group_id == uuid.UUID(group_id), GroupMember.user_email == "test@user.com")
            .first()
        )

        res = test_client.post(
            f"/api/v1/groups/{group_id}/settlements",
            json={"from_member_id": other, "to_member_id": str(mine.id), "amount": amount},
        )
        assert res.status_code == 422, res.text


class TestAnalysisTotalsPrecision:
    """The audit saw category totals like 306.49999999999994. Totals are rounded
    at the aggregation boundary so summing many cent values stays clean."""

    def test_category_totals_have_no_float_noise(self, test_client, db_session):
        from datetime import datetime

        from varavu_selavu_service.db.models import Expense

        # 0.1 + 0.2 style values that do not sum cleanly in binary floating point.
        for i, amount in enumerate([10.1, 20.2, 30.3, 45.67, 200.23]):
            db_session.add(
                Expense(
                    id=uuid.uuid4(),
                    user_email="test@user.com",
                    purchased_at=datetime(2026, 1, 15),
                    category_id="Food",
                    amount=Decimal(str(amount)),
                    description=f"Item {i}",
                )
            )
        db_session.commit()

        res = test_client.get("/api/v1/analysis", params={"user_id": "test@user.com"})
        assert res.status_code == 200, res.text
        body = res.json()

        for row in body["category_totals"]:
            assert row["total"] == round(row["total"], 2), row
        for row in body["monthly_trend"]:
            assert row["total"] == round(row["total"], 2), row
        assert body["total_expenses"] == round(body["total_expenses"], 2)
        # 10.1 + 20.2 + 30.3 + 45.67 + 200.23
        assert body["total_expenses"] == 306.50
