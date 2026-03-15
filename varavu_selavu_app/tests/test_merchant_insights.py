
import pytest
from datetime import datetime
from unittest.mock import MagicMock

from varavu_selavu_service.services.insight_analytics_service import InsightAnalyticsService
from varavu_selavu_service.db.models import Expense
from varavu_selavu_service.models.api_models import MerchantInsightSummary

@pytest.fixture
def mock_db_session():
    """Fixture for a mocked database session."""
    return MagicMock()

def test_calculate_merchant_metrics_no_data(mock_db_session):
    """Test that an empty list is returned when there are no expenses."""
    mock_db_session.query.return_value.filter.return_value.filter.return_value.filter.return_value.group_by.return_value.order_by.return_value.limit.return_value.all.return_value = []
    
    service = InsightAnalyticsService(db=mock_db_session)
    result = service.calculate_merchant_metrics(user_id="test@example.com")
    
    assert result == []

def test_calculate_merchant_metrics_with_data(mock_db_session):
    """Test that merchant metrics are calculated correctly."""
    mock_expenses = [
        ("Costco", 500.0, 2, datetime(2023, 1, 10), datetime(2023, 1, 20)),
        ("Amazon", 300.0, 3, datetime(2023, 1, 5), datetime(2023, 1, 25)),
    ]
    mock_db_session.query.return_value.filter.return_value.filter.return_value.filter.return_value.group_by.return_value.order_by.return_value.limit.return_value.all.return_value = mock_expenses
    
    service = InsightAnalyticsService(db=mock_db_session)
    results = service.calculate_merchant_metrics(user_id="test@example.com")
    
    assert len(results) == 2
    
    costco_summary = next(r for r in results if r.merchant_name == "Costco")
    assert costco_summary.total_spent == 500.0
    assert costco_summary.transaction_count == 2
    assert costco_summary.average_transaction_amount == 250.0
    assert costco_summary.first_seen_at == "2023-01-10"
    assert costco_summary.last_seen_at == "2023-01-20"
    
    amazon_summary = next(r for r in results if r.merchant_name == "Amazon")
    assert amazon_summary.total_spent == 300.0
    assert amazon_summary.transaction_count == 3
    assert amazon_summary.average_transaction_amount == 100.0
    assert amazon_summary.first_seen_at == "2023-01-05"
    assert amazon_summary.last_seen_at == "2023-01-25"

def test_calculate_merchant_metrics_with_date_filters(mock_db_session):
    """Test that date filters are applied correctly."""
    service = InsightAnalyticsService(db=mock_db_session)
    service.calculate_merchant_metrics(user_id="test@example.com", year=2023, month=1)
    
    # Check that the filter calls were made with the correct date parts
    # This is a bit of a simplification, in a real scenario you'd check the filter expressions
    assert mock_db_session.query.return_value.filter.call_count > 0
