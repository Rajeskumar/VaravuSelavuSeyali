import pytest
import os
import uuid
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# We expect E2E_DATABASE_URL to be set by our test orchestration script
DB_URL = os.environ.get("E2E_DATABASE_URL")

# Skip if we aren't running in genuine E2E mode
pytestmark = pytest.mark.skipif(
    not DB_URL, reason="Requires E2E_DATABASE_URL environment variable containing PostgreSQL connection string"
)

if DB_URL:
    os.environ["DATABASE_URL"] = DB_URL # Tell the app to use our containerized pg

from varavu_selavu_service.main import app
from varavu_selavu_service.db.session import Base, get_db
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import User, ItemInsight, MerchantInsight

try:
    engine = create_engine(DB_URL, execution_options={'schema_translate_map': {'trackspense': 'trackspense'}}) if DB_URL else None
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception:
    pass

def override_auth():
    return "e2e@test.com"

def override_get_db_pg():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# Only apply override if we actually load the app
if DB_URL:
    app.dependency_overrides[auth_required] = override_auth
    app.dependency_overrides[get_db] = override_get_db_pg

@pytest.fixture(scope="module")
def db_session_real():
    # Rely on external migration script having run
    db = TestingSessionLocal()
    
    # Try inserting user
    from sqlalchemy.dialects.postgresql import insert
    u_stmt = insert(User).values(id=uuid.uuid4(), email="e2e@test.com", password_hash="hash", name="E2E Test").on_conflict_do_nothing()
    db.execute(u_stmt)
    db.commit()
    
    yield db
    
    # Teardown the data
    db.query(ItemInsight).filter(ItemInsight.user_email=="e2e@test.com").delete()
    db.query(MerchantInsight).filter(MerchantInsight.user_email=="e2e@test.com").delete()
    db.query(User).filter(User.email=="e2e@test.com").delete()
    db.commit()
    db.close()

client = TestClient(app)

def test_full_expense_ingestion_and_analytics_flow(db_session_real):
    """
    Simulate saving an expense with items, running the insights aggregator,
    and then querying the analytics endpoints using a real Postgres database.
    """
    
    # 1. Add Expense
    payload = {
        "user_email": "e2e@test.com",
        "header": {
            "purchased_at": datetime.datetime.now().isoformat() + "Z",
            "merchant_name": "Target Validation",
            "category_id": "Groceries",
            "amount": 28.50,
            "tax": 2.00,
            "fingerprint": "test-fp-1234"
        },
        "items": [
            {
                "line_no": 1,
                "item_name": "Target Milk 1G",
                "normalized_name": "Whole Milk 1G",
                "category_id": "Groceries",
                "quantity": 2,
                "unit_price": 5.0,
                "line_total": 10.0
            },
            {
                "line_no": 2,
                "item_name": "Apples",
                "normalized_name": "Fuji Apples",
                "category_id": "Groceries",
                "quantity": 1,
                "unit_price": 16.50,
                "line_total": 16.50
            }
        ]
    }
    
    res = client.post("/api/v1/expenses/with_items", json=payload)
    assert res.status_code == 201
    
    # 2. Query Item Insights
    res_items = client.get("/api/v1/analytics/items?user_id=e2e@test.com")
    assert res_items.status_code == 200
    items = res_items.json()
    assert len(items) >= 2
    
    # Verify the milk aggregation
    milk_data = next(i for i in items if i["normalized_name"] == "Whole Milk 1G")
    assert milk_data["total_quantity_bought"] == 2
    assert milk_data["total_spent"] == 10.0
    
    # 3. Query Merchant Insights
    res_merchants = client.get("/api/v1/analytics/merchants?user_id=e2e@test.com")
    items = res_merchants.json()
    target_data = next(m for m in items if m["merchant_name"] == "Target Validation")
    assert target_data["total_spent"] == 26.5
    assert target_data["transaction_count"] == 1
    
    # 4. Check details
    res_detail = client.get("/api/v1/analytics/items/Whole%20Milk%201G?user_id=e2e@test.com")
    detail = res_detail.json()
    assert len(detail["price_history"]) > 0
    assert detail["price_history"][0]["store_name"] == "Target Validation"
