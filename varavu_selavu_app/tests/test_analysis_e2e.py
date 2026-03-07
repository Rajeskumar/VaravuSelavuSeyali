import pytest
import os
import uuid
from datetime import datetime
from fastapi.testclient import TestClient
from varavu_selavu_service.db.models import Expense

def test_analysis_endpoint_e2e(test_client, db_session):
    """Verifies that AnalysisService correctly computes analytics based on sqlite test db parameters mapped to SQLModel schemas."""
    
    # Seed generic Expenses
    e1 = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        purchased_at=datetime(2025, 1, 15),
        amount=15.50,
        category_id="Groceries",
        description="Market"
    )
    e2 = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        purchased_at=datetime(2025, 1, 25),
        amount=30.00,
        category_id="Groceries",
        description="Supermarket"
    )
    e3 = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        purchased_at=datetime(2025, 2, 5),
        amount=100.00,
        category_id="Utilities",
        description="Electric"
    )
    db_session.add_all([e1, e2, e3])
    db_session.commit()
    
    client = test_client

    # 1. Test Without Filters
    resp = client.get("/api/v1/analysis?user_id=test@user.com&use_cache=false")
    assert resp.status_code == 200
    data = resp.json()
    
    # Assert top categories
    assert data["total_expenses"] == 145.5
    cats = {c["category"]: c["total"] for c in data["category_totals"]}
    assert cats["Groceries"] == 45.5
    assert cats["Utilities"] == 100.0
    
    # 2. Test With Filters (January 2025)
    resp = client.get("/api/v1/analysis?user_id=test@user.com&year=2025&month=1&use_cache=false")
    assert resp.status_code == 200
    data_filtered = resp.json()
    assert data_filtered["total_expenses"] == 45.5
    assert "Utilities" not in {c["category"] for c in data_filtered["category_totals"]}
