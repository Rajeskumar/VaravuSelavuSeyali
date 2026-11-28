"""Recurring run-now and confirm took any number: NaN passed `cost <= 0` and was stored (TS-FIX-104, AC-001)."""
import json
import uuid
from datetime import datetime

import pytest

from varavu_selavu_service.db.models import Expense, RecurringTemplate

# Raw JSON text: NaN and Infinity cannot be sent through `json=`.
BAD = ["NaN", "Infinity", "-Infinity", "0", "-1", "2000000", "12.345", '"abc"', '"NaN"']


def _template(test_client, **extra):
    today = datetime.utcnow()
    res = test_client.post("/api/v1/recurring/upsert", json={
        "description": "Rent", "category": "Home", "day_of_month": today.day, "default_cost": 30.0,
        "start_date_iso": today.strftime("%Y-%m-%d"), **extra})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _post(test_client, path, body):
    return test_client.post(path, content=body, headers={"Content-Type": "application/json"})


def _nothing_happened(db_session, template_id):
    db_session.expire_all()
    assert db_session.query(Expense).count() == 0
    assert db_session.query(RecurringTemplate).filter(RecurringTemplate.id == uuid.UUID(template_id)).one().last_processed_date is None


@pytest.mark.parametrize("cost", BAD)
def test_run_now_refuses_an_amount_outside_the_money_limits(test_client, db_session, cost):
    template_id = _template(test_client)

    res = _post(test_client, "/api/v1/recurring/execute_now", f'{{"template_id": "{template_id}", "cost": {cost}}}')

    assert res.status_code == 200, res.text
    assert res.json() == {"success": False, "created": False, "error": "invalid cost"}
    _nothing_happened(db_session, template_id)


@pytest.mark.parametrize("cost", BAD)
def test_confirm_refuses_an_amount_outside_the_money_limits(test_client, db_session, cost):
    template_id = _template(test_client)
    due = [d for d in test_client.get("/api/v1/recurring/due").json() if d["template_id"] == template_id]

    res = _post(test_client, "/api/v1/recurring/confirm",
                f'{{"items": [{{"template_id": "{template_id}", "date_iso": "{due[0]["date_iso"]}", "cost": {cost}}}]}}')

    assert res.status_code == 422, res.text
    _nothing_happened(db_session, template_id)


@pytest.mark.parametrize("sent, stored", [(None, 30.0), (12.5, 12.5), ("12.50", 12.5)])
def test_valid_and_omitted_amounts_still_work(test_client, db_session, sent, stored):
    template_id = _template(test_client)
    body = {"template_id": template_id} if sent is None else {"template_id": template_id, "cost": sent}

    assert test_client.post("/api/v1/recurring/execute_now", json=body).json()["success"] is True
    assert [float(e.amount) for e in db_session.query(Expense).all()] == [stored]


def test_confirm_without_an_amount_uses_the_templates(test_client, db_session):
    template_id = _template(test_client)
    due = [d for d in test_client.get("/api/v1/recurring/due").json() if d["template_id"] == template_id]

    res = test_client.post("/api/v1/recurring/confirm", json={"items": [{"template_id": template_id, "date_iso": due[0]["date_iso"]}]})

    assert res.json() == {"success": True, "processed": 1}
    assert [float(e.amount) for e in db_session.query(Expense).all()] == [30.0]
