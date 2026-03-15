import pytest
from datetime import datetime
from varavu_selavu_service.services.insight_analytics_service import InsightAnalyticsService
from varavu_selavu_service.db.models import Expense, ExpenseItem
from varavu_selavu_service.db.session import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope="module")
def db_session():
    # Use an in-memory SQLite database for testing, ignoring schemas
    engine = create_engine(
        "sqlite:///:memory:",
        execution_options={"schema_translate_map": {"trackspense": None}}
    )
    Base.metadata.create_all(engine)
    SessionFast = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionFast()
    
    # Seed data
    user_id = "test@example.com"
    
    e1 = Expense(
        user_email=user_id,
        merchant_name="Amazon",
        purchased_at=datetime(2023, 10, 15),
        amount=100.0,
        category_id="Shopping"
    )
    e2 = Expense(
        user_email=user_id,
        merchant_name="Amazon",
        purchased_at=datetime(2024, 1, 10),
        amount=150.0,
        category_id="Shopping"
    )
    e3 = Expense(
        user_email=user_id,
        merchant_name="Walmart",
        purchased_at=datetime(2024, 1, 20),
        amount=50.0,
        category_id="Groceries"
    )
    
    session.add_all([e1, e2, e3])
    session.commit()
    
    # Add items
    i1 = ExpenseItem(
        expense_id=e1.id,
        user_email=user_id,
        line_no=1,
        item_name="Book",
        normalized_name="Book",
        unit_price=100.0,
        quantity=1,
        line_total=100.0
    )
    i2 = ExpenseItem(
        expense_id=e2.id,
        user_email=user_id,
        line_no=1,
        item_name="Book",
        normalized_name="Book",
        unit_price=150.0,
        quantity=1,
        line_total=150.0
    )
    i3 = ExpenseItem(
        expense_id=e3.id,
        user_email=user_id,
        line_no=1,
        item_name="Apple",
        normalized_name="Apple",
        unit_price=2.0,
        quantity=25,
        line_total=50.0
    )
    
    session.add_all([i1, i2, i3])
    session.commit()
    
    yield session
    
    session.close()

def test_merchant_metrics_all_time(db_session):
    service = InsightAnalyticsService(db_session)
    metrics = service.calculate_merchant_metrics(user_id="test@example.com")
    
    assert len(metrics) == 2
    # Sorted by total_spent desc
    assert metrics[0].merchant_name == "Amazon"
    assert metrics[0].total_spent == 250.0
    assert metrics[0].transaction_count == 2
    
    assert metrics[1].merchant_name == "Walmart"
    assert metrics[1].total_spent == 50.0
    assert metrics[1].transaction_count == 1

def test_merchant_metrics_with_year_filter(db_session):
    service = InsightAnalyticsService(db_session)
    metrics = service.calculate_merchant_metrics(user_id="test@example.com", year=2024)
    
    assert len(metrics) == 2
    # Amazon only has 150 in 2024
    assert metrics[0].merchant_name == "Amazon"
    assert metrics[0].total_spent == 150.0
    assert metrics[0].transaction_count == 1
    
    assert metrics[1].merchant_name == "Walmart"
    assert metrics[1].total_spent == 50.0
    assert metrics[1].transaction_count == 1

def test_merchant_metrics_with_date_range_filter(db_session):
    service = InsightAnalyticsService(db_session)
    # Start date overrides year/month
    metrics = service.calculate_merchant_metrics(
        user_id="test@example.com", 
        start_date="2023-10-01", 
        end_date="2023-11-01",
        year=2024 # this should be ignored
    )
    
    assert len(metrics) == 1
    assert metrics[0].merchant_name == "Amazon"
    assert metrics[0].total_spent == 100.0

def test_item_metrics_all_time(db_session):
    service = InsightAnalyticsService(db_session)
    metrics = service.calculate_item_metrics(user_id="test@example.com")
    
    assert len(metrics) == 2
    assert metrics[0].item_name == "Book"
    assert metrics[0].total_spent == 250.0
    assert metrics[0].total_quantity_bought == 2.0
    assert metrics[0].min_unit_price == 100.0
    assert metrics[0].max_unit_price == 150.0
    assert metrics[0].average_unit_price == 125.0
    
    assert metrics[1].item_name == "Apple"
    assert metrics[1].total_spent == 50.0
    assert metrics[1].total_quantity_bought == 25.0
    assert metrics[1].average_unit_price == 2.0

def test_item_detail(db_session):
    service = InsightAnalyticsService(db_session)
    detail = service.calculate_item_detail(user_id="test@example.com", item_name="Book")
    
    assert detail is not None
    assert detail["item_name"] == "Book"
    assert detail["total_spent"] == 250.0
    assert detail["purchase_count"] == 2
    assert len(detail["price_history"]) == 2
    assert detail["price_history"][0]["unit_price"] == 100.0
    assert detail["price_history"][1]["unit_price"] == 150.0
    assert len(detail["store_comparison"]) == 1
    assert detail["store_comparison"][0]["store_name"] == "Amazon"
    assert detail["store_comparison"][0]["avg_price"] == 125.0

def test_item_detail_filtered(db_session):
    service = InsightAnalyticsService(db_session)
    detail = service.calculate_item_detail(user_id="test@example.com", item_name="Book", year=2024)
    
    assert detail is not None
    assert detail["item_name"] == "Book"
    assert detail["total_spent"] == 150.0
    assert detail["purchase_count"] == 1
    assert len(detail["price_history"]) == 1
    assert detail["price_history"][0]["unit_price"] == 150.0
    assert len(detail["store_comparison"]) == 1
    assert detail["store_comparison"][0]["avg_price"] == 150.0
