import pytest
from unittest.mock import patch
from varavu_selavu_service.services.receipt_service import ReceiptService
from varavu_selavu_service.api.routes import get_receipt_service
from varavu_selavu_service.db.models import Expense, ExpenseItem

SAMPLE_TEXT = (
    "Merchant: Test Store\n"
    "Date: 2025-02-14T18:22:00Z\n"
    "1. Sample Item qty 1 each price 1.00 total 1.00\n"
    "Subtotal: 1.00\n"
    "Tax: 0.00\n"
    "Total: 1.00\n"
)


def test_receipt_service_parse():
    svc = ReceiptService(engine="mock")
    result = svc.parse(SAMPLE_TEXT.encode())
    assert result["header"]["merchant_name"] == "Test Store"
    assert result["items"][0]["item_name"] == "Sample Item"


def test_parse_endpoint(test_client):
    app = test_client.app
    app.dependency_overrides[get_receipt_service] = lambda: ReceiptService(engine="mock")
    
    resp = test_client.post(
        "/api/v1/ingest/receipt/parse",
        files={"file": ("r.txt", SAMPLE_TEXT.encode(), "text/plain")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["header"]["merchant_name"] == "Test Store"
    
    app.dependency_overrides.pop(get_receipt_service, None)


def test_create_expense_with_items(test_client, db_session):
    payload = {
        "user_email": "test@user.com",
        "header": {
            "purchased_at": "2025-02-14T18:22:00Z",
            "merchant_name": "Test Store",
            "amount": 1.0,
            "currency": "USD",
            "category_id": "Shopping",
            "tax": 0.0,
            "tip": 0.0,
            "discount": 0.0,
            "fingerprint": "abc",
        },
        "items": [
            {
                "line_no": 1,
                "item_name": "Sample Item",
                "line_total": 1.0,
            }
        ],
    }
    
    resp = test_client.post("/api/v1/expenses/with_items", json=payload)
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["expense_id"]
    
    # Assert written to DB
    expenses = db_session.query(Expense).filter(Expense.user_email == "test@user.com").all()
    assert len(expenses) == 1
    assert expenses[0].fingerprint == "abc"
    assert expenses[0].merchant_name == "Test Store"
    
    items = db_session.query(ExpenseItem).filter(ExpenseItem.expense_id == expenses[0].id).all()
    assert len(items) == 1
    assert items[0].item_name == "Sample Item"

    # Idempotency
    resp2 = test_client.post("/api/v1/expenses/with_items", json=payload)
    assert resp2.status_code == 409
