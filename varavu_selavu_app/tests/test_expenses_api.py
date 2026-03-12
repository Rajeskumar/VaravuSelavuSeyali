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


def test_create_expense_with_merchant_name(test_client, db_session):
    """Adding an expense with merchant_name should persist and return it."""
    payload = {
        "user_id": "test@user.com",
        "cost": 8.50,
        "category": "Food & Drink",
        "description": "Latte at Starbucks",
        "date": "03/11/2026",
        "merchant_name": "Starbucks",
    }
    res = test_client.post("/api/v1/expenses", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["success"] is True
    assert data["expense"]["merchant_name"] == "Starbucks"

    # Verify stored in DB
    stored = db_session.query(Expense).filter(
        Expense.user_email == "test@user.com",
        Expense.description == "Latte at Starbucks",
    ).first()
    assert stored is not None
    assert stored.merchant_name == "Starbucks"


def test_update_expense_merchant_name(test_client, db_session):
    """Updating an expense should overwrite the merchant_name."""
    e_id = uuid.uuid4()
    e = Expense(
        id=e_id,
        user_email="test@user.com",
        purchased_at=datetime(2024, 6, 1),
        category_id="Other",
        amount=20.0,
        description="Misc purchase",
        merchant_name="OldMerchant",
    )
    db_session.add(e)
    db_session.commit()

    payload = {
        "user_id": "test@user.com",
        "cost": 20.0,
        "category": "Other",
        "description": "Misc purchase",
        "date": "06/01/2024",
        "merchant_name": "NewMerchant",
    }
    res = test_client.put(f"/api/v1/expenses/{str(e_id)}", json=payload)
    assert res.status_code == 200
    assert res.json()["expense"]["merchant_name"] == "NewMerchant"

    db_session.refresh(e)
    assert e.merchant_name == "NewMerchant"
