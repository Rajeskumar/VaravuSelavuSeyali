import pytest
import os
import uuid
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool

# Ensure we use an in-memory db for these unit tests if not specified
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from varavu_selavu_service.main import app
from varavu_selavu_service.db.session import Base, get_db
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import User, Expense, ExpenseItem, ItemInsight, MerchantInsight

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    execution_options={"schema_translate_map": {"trackspense": None}}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

def override_auth():
    return "test@user.com"

app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[auth_required] = override_auth

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Seed User
    user_id = uuid.uuid4()
    user = User(id=user_id, email="test@user.com", password_hash="hash", name="Test User")
    db.add(user)

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
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)

client = TestClient(app)

def test_get_top_items(db_session):
    response = client.get("/api/v1/analytics/items?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["normalized_name"] == "Apples" or data[0]["item_name"] == "Apples"

def test_get_item_detail(db_session):
    response = client.get("/api/v1/analytics/items/Apples")
    assert response.status_code == 200
    data = response.json()
    assert data["normalized_name"] == "Apples" or data["item_name"] == "Apples"
    assert "price_history" in data
    assert "store_comparison" in data
    
def test_get_top_merchants(db_session):
    response = client.get("/api/v1/analytics/merchants?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["merchant_name"] == "Walmart"

def test_get_merchant_detail(db_session):
    response = client.get("/api/v1/analytics/merchants/Walmart")
    assert response.status_code == 200
    data = response.json()
    assert data["merchant_name"] == "Walmart"
    assert "monthly_aggregates" in data
    assert "items_bought" in data

def test_analysis_chat_with_item_intent(db_session):
    # Asking about an item should trigger the item intent
    response = client.post(
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

def test_analysis_chat_with_merchant_intent(db_session):
    # Asking about a merchant should trigger the merchant intent
    response = client.post(
        "/api/v1/analysis/chat",
        json={
            "user_id": "test@user.com",
            "query": "How much did I spend at Walmart?",
        }
    )
    assert response.status_code == 200
    assert "response" in response.json()
