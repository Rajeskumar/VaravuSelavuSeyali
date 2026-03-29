import pytest
import os
import uuid
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from unittest.mock import patch

# Ensure we use an in-memory db for these unit tests if not specified
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from varavu_selavu_service.main import app
from varavu_selavu_service.db.session import Base, get_db
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import User, Expense, ExpenseItem, ItemInsight, MerchantInsight

@pytest.fixture(scope="function")
def analytics_db_session(db_session):
    db = db_session
    
    # Seed Data for Dynamic Retrieval
    e1 = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        merchant_name="Walmart",
        amount=150.0,
        category_id="Shopping",
        purchased_at=datetime.datetime(2023, 5, 10)
    )
    db.add(e1)

    i1 = ExpenseItem(
        id=uuid.uuid4(),
        expense_id=e1.id,
        user_email="test@user.com",
        line_no=1,
        item_name="Apples",
        normalized_name="Apples",
        unit_price=2.0,
        quantity=10,
        line_total=20.0
    )
    db.add(i1)

    # Seed ItemInsights
    item1 = ItemInsight(id=uuid.uuid4(), user_email="test@user.com", normalized_name="Apples", avg_unit_price=2.0, min_price=1.5, max_price=2.5, total_quantity_bought=10, total_spent=20.0)
    db.add(item1)
    
    # Seed MerchantInsights
    merchant1 = MerchantInsight(id=uuid.uuid4(), user_email="test@user.com", merchant_name="Walmart", total_spent=150.0, transaction_count=5)
    db.add(merchant1)
    
    db.commit()
    db.commit()
    yield db

def test_get_top_items(test_client, analytics_db_session):
    response = test_client.get("/api/v1/analytics/items?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["normalized_name"] == "Apples" or data[0]["item_name"] == "Apples"

def test_get_item_detail(test_client, analytics_db_session):
    response = test_client.get("/api/v1/analytics/items/Apples?user_id=test@user.com")
    assert response.status_code == 200
    data = response.json()
    assert data["normalized_name"] == "Apples" or data["item_name"] == "Apples"
    assert "price_history" in data
    assert "store_comparison" in data
    
def test_get_top_merchants(test_client, analytics_db_session):
    response = test_client.get("/api/v1/analytics/merchants?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["merchant_name"] == "Walmart"

def test_get_merchant_detail(test_client, analytics_db_session):
    response = test_client.get("/api/v1/analytics/merchants/Walmart?user_id=test@user.com")
    assert response.status_code == 200
    data = response.json()
    assert data["merchant_name"] == "Walmart"
    assert "monthly_aggregates" in data
    assert "items_bought" in data

@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_analysis_chat_with_item_intent(mock_call_chat_model, test_client, analytics_db_session):
    mock_call_chat_model.return_value = "Apples cost $2.00 on average."
    # Asking about an item should trigger the item intent
    response = test_client.post(
        "/api/v1/analysis/chat",
        json={
            "user_id": "test@user.com",
            "query": "How much are apples?",
            "year": 2023,
            "month": 5
        }
    )
    # Testing that it returns 200 and a chat response is enough,
    # as the actual LLM call might be mocked or return a generated string based on context
    assert response.status_code == 200
    assert "response" in response.json()

@patch("varavu_selavu_service.api.routes.call_chat_model")
def test_analysis_chat_with_merchant_intent(mock_call_chat_model, test_client, analytics_db_session):
    mock_call_chat_model.return_value = "You spent $150.0 at Walmart."
    # Asking about a merchant should trigger the merchant intent
    response = test_client.post(
        "/api/v1/analysis/chat",
        json={
            "user_id": "test@user.com",
            "query": "How much did I spend at Walmart?",
        }
    )
    assert response.status_code == 200
    assert "response" in response.json()
