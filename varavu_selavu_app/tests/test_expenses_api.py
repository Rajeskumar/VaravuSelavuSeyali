import pytest
import uuid
from datetime import datetime
from varavu_selavu_service.db.models import Expense

def test_list_expenses(test_client, db_session):
    e1_id = uuid.uuid4()
    e2_id = uuid.uuid4()
    
    e1 = Expense(
        id=e1_id,
        user_email="test@user.com",
        purchased_at=datetime(2024, 1, 1),
        category_id="Food & Drink",
        amount=3.5,
        description="Coffee"
    )
    e2 = Expense(
        id=e2_id,
        user_email="test@user.com",
        purchased_at=datetime(2024, 1, 2),
        category_id="Food & Drink",
        amount=12.0,
        description="Lunch"
    )
    db_session.add_all([e1, e2])
    db_session.commit()

    res = test_client.get("/api/v1/expenses", params={"user_id": "test@user.com", "limit": 1})
    assert res.status_code == 200
    data = res.json()
    
    # Should return most recent first
    assert len(data["items"]) == 1
    assert data["items"][0]["description"] == "Lunch"
    assert data["next_offset"] == 1


def test_delete_expense(test_client, db_session):
    e_id = uuid.uuid4()
    e = Expense(
        id=e_id,
        user_email="test@user.com",
        purchased_at=datetime(2024, 1, 1),
        category_id="Misc",
        amount=10.0,
        description="To Delete"
    )
    db_session.add(e)
    db_session.commit()

    res = test_client.delete(f"/api/v1/expenses/{str(e_id)}")
    assert res.status_code == 200
    assert res.json() == {"success": True}
    
    # Verify it was deleted from db
    deleted = db_session.query(Expense).filter(Expense.id == e_id).first()
    assert deleted is None
