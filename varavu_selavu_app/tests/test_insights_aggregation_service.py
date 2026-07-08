import pytest
from datetime import datetime
from uuid import uuid4
from decimal import Decimal

from varavu_selavu_service.services.insights_aggregation_service import InsightsAggregationService
from varavu_selavu_service.db.models import MerchantInsight, ItemInsight, ItemPriceHistory
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
    
    yield session
    
    session.close()

def test_on_group_expense_created(db_session):
    service = InsightsAggregationService(db_session)
    
    member_shares = {
        "user1@example.com": 60.0,
        "user2@example.com": 40.0
    }
    
    service.on_group_expense_created(
        member_shares=member_shares,
        merchant_name="GroupStore",
        purchased_at=datetime(2023, 10, 15)
    )
    
    # Check insights for user1
    u1_insight = db_session.query(MerchantInsight).filter_by(user_email="user1@example.com", merchant_name="GroupStore").first()
    assert u1_insight is not None
    assert float(u1_insight.total_spent) == 60.0
    
    # Check insights for user2
    u2_insight = db_session.query(MerchantInsight).filter_by(user_email="user2@example.com", merchant_name="GroupStore").first()
    assert u2_insight is not None
    assert float(u2_insight.total_spent) == 40.0

def test_on_group_expense_with_items_created(db_session):
    service = InsightsAggregationService(db_session)
    expense_id = str(uuid4())
    
    member_shares = {
        "user1@example.com": 60.0,
        "user2@example.com": 40.0
    }
    
    member_item_shares = {
        "user1@example.com": [
            {
                "normalized_name": "pizza",
                "item_name": "Pizza",
                "unit_price": 20.0,
                "share_quantity": 1,
                "share_amount": 20.0
            }
        ],
        "user2@example.com": [
            {
                "normalized_name": "soda",
                "item_name": "Soda",
                "unit_price": 5.0,
                "share_quantity": 2,
                "share_amount": 10.0
            }
        ]
    }
    
    service.on_group_expense_with_items_created(
        expense_id=expense_id,
        member_shares=member_shares,
        member_item_shares=member_item_shares,
        merchant_name="PizzaPlace",
        purchased_at=datetime(2023, 10, 16)
    )
    
    # Check Item Insights
    u1_item = db_session.query(ItemInsight).filter_by(user_email="user1@example.com", normalized_name="pizza").first()
    assert u1_item is not None
    assert float(u1_item.total_spent) == 20.0
    assert float(u1_item.total_quantity_bought) == 1.0
    
    u2_item = db_session.query(ItemInsight).filter_by(user_email="user2@example.com", normalized_name="soda").first()
    assert u2_item is not None
    assert float(u2_item.total_spent) == 10.0
    assert float(u2_item.total_quantity_bought) == 2.0
    
    # Check Price History for pure unit price
    u1_history = db_session.query(ItemPriceHistory).filter_by(item_insight_id=u1_item.id).first()
    assert float(u1_history.unit_price) == 20.0

    u2_history = db_session.query(ItemPriceHistory).filter_by(item_insight_id=u2_item.id).first()
    assert float(u2_history.unit_price) == 5.0
