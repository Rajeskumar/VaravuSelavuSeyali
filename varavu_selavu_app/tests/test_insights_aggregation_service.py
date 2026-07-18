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


# ---------------------------------------------------------------------------
# TS-ENT-105: dual-write of canonical_merchant_id / canonical_item_id.
# SQLite has no pg_trgm, so entity_resolution_service's tier-3/4 trigram
# lookup always degrades to "no candidates" here (see
# EntityResolutionService._fetch_trigram_candidates) and every new name falls
# through to tier 5 (mint a new canonical entity) — which is enough to
# exercise that the FK actually gets populated end-to-end.
# ---------------------------------------------------------------------------

def test_merchant_insight_dual_writes_canonical_merchant_id(db_session):
    service = InsightsAggregationService(db_session)
    service.on_simple_expense_created(
        user_email="dualwrite@example.com",
        merchant_name="Brand New Merchant Co",
        purchased_at=datetime(2023, 11, 1),
        amount=25.0,
    )
    insight = (
        db_session.query(MerchantInsight)
        .filter_by(user_email="dualwrite@example.com", merchant_name="Brand New Merchant Co")
        .first()
    )
    assert insight is not None
    assert insight.canonical_merchant_id is not None


def test_item_insight_dual_writes_canonical_item_id(db_session):
    service = InsightsAggregationService(db_session)
    service.on_expense_with_items_created(
        user_email="dualwrite@example.com",
        expense_id=str(uuid4()),
        merchant_name="Dual Write Grocery",
        purchased_at=datetime(2023, 11, 2),
        items=[{"normalized_name": "brand new widget", "unit_price": 3.0, "quantity": 2, "line_total": 6.0}],
    )
    insight = (
        db_session.query(ItemInsight)
        .filter_by(user_email="dualwrite@example.com", normalized_name="brand new widget")
        .first()
    )
    assert insight is not None
    assert insight.canonical_item_id is not None


def test_merchant_insight_reuses_same_canonical_id_on_repeat_writes(db_session):
    service = InsightsAggregationService(db_session)
    service.on_simple_expense_created(
        user_email="dualwrite2@example.com",
        merchant_name="Repeat Visit Store",
        purchased_at=datetime(2023, 11, 3),
        amount=10.0,
    )
    first = (
        db_session.query(MerchantInsight)
        .filter_by(user_email="dualwrite2@example.com", merchant_name="Repeat Visit Store")
        .first()
    )
    first_canonical_id = first.canonical_merchant_id
    assert first_canonical_id is not None

    # Second write for the same merchant should link to the SAME canonical
    # entity (tier-1 exact match on the now-existing canonical_name), not
    # mint a second one.
    service.on_simple_expense_created(
        user_email="dualwrite2@example.com",
        merchant_name="Repeat Visit Store",
        purchased_at=datetime(2023, 11, 4),
        amount=15.0,
    )
    db_session.refresh(first)
    assert first.canonical_merchant_id == first_canonical_id
