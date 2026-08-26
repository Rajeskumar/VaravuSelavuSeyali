import pytest
from datetime import date, datetime, timezone
from unittest.mock import patch
from varavu_selavu_service.services.receipt_service import ReceiptService
from varavu_selavu_service.api.routes import get_receipt_service
from varavu_selavu_service.db.models import Expense, ExpenseItem
from varavu_selavu_service.repo.postgres_repo import PostgresRepo

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
        # Content-type must be one of ALLOWED_MIME — the mock engine decodes the body as
        # text regardless of the declared type, so this only exercises the MIME allowlist,
        # not real image parsing.
        files={"file": ("r.txt", SAMPLE_TEXT.encode(), "image/png")},
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


# --- TS-BUG-101 regression: itemized/receipt-scan expense dates must not roll
# back a day. See docs/engineering/tickets/TS-BUG-101-date-off-by-one.md.

def test_create_expense_with_items_date_round_trip(test_client, db_session):
    """The MM/DD/YYYY string both clients now send must land on the exact
    intended calendar date — this is the literal repro for symptom #1."""
    payload = {
        "user_email": "test@user.com",
        "header": {
            "purchased_at": "07/15/2026",
            "merchant_name": "Date Test Store",
            "amount": 10.0,
            "category_id": "Shopping",
            "fingerprint": "date-rt-mdy",
        },
        "items": [{"line_no": 1, "item_name": "Widget", "line_total": 10.0}],
    }
    resp = test_client.post("/api/v1/expenses/with_items", json=payload)
    assert resp.status_code == 201, resp.text

    expense = db_session.query(Expense).filter(Expense.fingerprint == "date-rt-mdy").one()
    assert expense.purchased_at.strftime("%m/%d/%Y") == "07/15/2026"


def test_create_expense_with_items_iso_date_round_trip(test_client, db_session):
    """A bare YYYY-MM-DD string (e.g. what a receipt-parser response's
    header.purchased_at looks like) must also round-trip unchanged."""
    payload = {
        "user_email": "test@user.com",
        "header": {
            "purchased_at": "2026-07-15",
            "merchant_name": "Date Test Store 2",
            "amount": 5.0,
            "category_id": "Shopping",
            "fingerprint": "date-rt-iso",
        },
        "items": [{"line_no": 1, "item_name": "Gadget", "line_total": 5.0}],
    }
    resp = test_client.post("/api/v1/expenses/with_items", json=payload)
    assert resp.status_code == 201, resp.text

    expense = db_session.query(Expense).filter(Expense.fingerprint == "date-rt-iso").one()
    assert expense.purchased_at.strftime("%m/%d/%Y") == "07/15/2026"


def test_normalize_purchased_at_uses_date_part_only():
    """Direct unit coverage for PostgresRepo._normalize_purchased_at: only the
    calendar-date portion is ever trusted, regardless of input shape — a
    full ISO datetime/offset (the shape a client's `Date.toISOString()`
    would produce) must never shift which day gets stored."""
    noon_utc = lambda y, m, d: datetime(y, m, d, 12, tzinfo=timezone.utc)

    assert PostgresRepo._normalize_purchased_at("07/15/2026") == noon_utc(2026, 7, 15)
    assert PostgresRepo._normalize_purchased_at("2026-07-15") == noon_utc(2026, 7, 15)
    assert PostgresRepo._normalize_purchased_at("2026-07-15T23:59:59+05:30") == noon_utc(2026, 7, 15)
    assert PostgresRepo._normalize_purchased_at("2026-07-15T00:00:00.000Z") == noon_utc(2026, 7, 15)
    assert PostgresRepo._normalize_purchased_at(datetime(2026, 7, 15, 3, 0)) == noon_utc(2026, 7, 15)
    assert PostgresRepo._normalize_purchased_at(date(2026, 7, 15)) == noon_utc(2026, 7, 15)
    assert PostgresRepo._normalize_purchased_at(None) is None
    assert PostgresRepo._normalize_purchased_at("not-a-date") is None
