import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from unittest.mock import patch, MagicMock
from varavu_selavu_service.main import app
from varavu_selavu_service.db.models import User, Group, GroupMember, RecurringTemplate, Expense
import uuid
from datetime import datetime

client = TestClient(app)

def setup_user_and_group(db_session: Session):
    user = User(email="recurring@test.com", password_hash="hash")
    db_session.add(user)
    db_session.commit()
    
    group = Group(
        id=uuid.uuid4(),
        name="Recurring Group",
        created_by="recurring@test.com"
    )
    db_session.add(group)
    db_session.commit()
    
    member = GroupMember(
        group_id=group.id,
        user_email="recurring@test.com",
        display_name="Recurring User",
        joined_at=datetime.utcnow()
    )
    db_session.add(member)
    db_session.commit()
    
    return user, group

@pytest.fixture
def mock_auth():
    from varavu_selavu_service.auth.security import auth_required
    # Save the original
    original = app.dependency_overrides.get(auth_required)
    app.dependency_overrides[auth_required] = lambda: "recurring@test.com"
    yield
    if original:
        app.dependency_overrides[auth_required] = original
    else:
        app.dependency_overrides.pop(auth_required, None)

def test_recurring_group_expense_creation(db_session: Session, mock_auth):
    user, group = setup_user_and_group(db_session)
    
    # 1. Create a group recurring template
    res = client.post("/api/v1/recurring/upsert", json={
        "description": "Internet Bill",
        "category": "Utilities",
        "day_of_month": 5,
        "default_cost": 50.0,
        "group_id": str(group.id),
        "split_config": {"type": "equal", "entries": []}
    })
    assert res.status_code == 200, res.json()
    data = res.json()
    print("DATA", data)
    assert data["group_id"] == str(group.id)
    tpl_id = data["id"]
    
    # 2. Execute now
    res = client.post("/api/v1/recurring/execute_now", json={
        "template_id": tpl_id,
        "cost": 50.0
    })
    assert res.status_code == 200
    assert res.json()["success"] is True
    
    # Verify group expense was created
    expenses = db_session.query(Expense).filter(Expense.group_id == group.id).all()
    assert len(expenses) == 1
    assert expenses[0].description == "Internet Bill"
    assert float(expenses[0].amount) == 50.0
    assert expenses[0].split_type == "equal"

def test_recurring_group_expense_confirm(db_session: Session, mock_auth):
    user, group = setup_user_and_group(db_session)
    
    # 1. Create a group recurring template
    res = client.post("/api/v1/recurring/upsert", json={
        "description": "Phone Bill",
        "category": "Utilities",
        "day_of_month": datetime.utcnow().day,
        "default_cost": 30.0,
        "start_date_iso": datetime.utcnow().strftime("%Y-%m-%d"),
        "group_id": str(group.id),
        "split_config": {"type": "equal", "entries": []}
    })
    assert res.status_code == 200
    tpl_id = res.json()["id"]
    
    # 2. Check due
    res = client.get("/api/v1/recurring/due")
    assert res.status_code == 200
    due = [d for d in res.json() if d["template_id"] == tpl_id]
    assert len(due) > 0
    date_iso = due[0]["date_iso"]
    
    # 3. Confirm
    res = client.post("/api/v1/recurring/confirm", json={
        "items": [{"template_id": tpl_id, "date_iso": date_iso, "cost": 30.0}]
    })
    assert res.status_code == 200
    assert res.json()["success"] is True
    
    # Verify group expense was created
    expenses = db_session.query(Expense).filter(Expense.group_id == group.id, Expense.description == "Phone Bill").all()
    assert len(expenses) == 1
    assert expenses[0].description == "Phone Bill"
    
    # Confirm idempotency
    res = client.post("/api/v1/recurring/confirm", json={
        "items": [{"template_id": tpl_id, "date_iso": date_iso, "cost": 30.0}]
    })
    assert res.status_code == 200
    
    expenses_after = db_session.query(Expense).filter(Expense.group_id == group.id, Expense.description == "Phone Bill").all()
    assert len(expenses_after) == 1
