import io
from fastapi.testclient import TestClient

from varavu_selavu_service.main import app
from varavu_selavu_service.services.receipt_service import ReceiptService
from varavu_selavu_service.api.routes import get_receipt_service, get_sheets_repo
from varavu_selavu_service.auth.security import auth_required


class FakeSheetsRepo:
    def __init__(self):
        self.expenses = []
        self.items = []

    def find_expense_by_fingerprint(self, user_email, fingerprint):
        for e in self.expenses:
            if e["user_email"] == user_email and e.get("fingerprint") == fingerprint:
                return e
        return None

    def append_expense(self, header):
        eid = f"e{len(self.expenses)+1}"
        header = {**header, "id": eid}
        self.expenses.append(header)
        return eid

    def delete_expense(self, expense_id):
        self.expenses = [e for e in self.expenses if e["id"] != expense_id]

    def append_items(self, user_email, expense_id, items):
        ids = []
        for item in items:
            iid = f"i{len(self.items)+1}"
            self.items.append({**item, "id": iid, "user_email": user_email, "expense_id": expense_id})
            ids.append(iid)
        return ids


fake_repo = FakeSheetsRepo()
app.dependency_overrides[get_sheets_repo] = lambda: fake_repo
app.dependency_overrides[get_receipt_service] = lambda: ReceiptService(engine="mock")
app.dependency_overrides[auth_required] = lambda: "test"
client = TestClient(app)


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


def test_parse_endpoint():
    resp = client.post(
        "/api/v1/ingest/receipt/parse",
        files={"file": ("r.png", SAMPLE_TEXT.encode(), "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["header"]["merchant_name"] == "Test Store"
    assert "confidence" in data["meta"]


def test_create_expense_with_items():
    payload = {
        "user_email": "user@example.com",
        "header": {
            "purchased_at": "2025-02-14T18:22:00Z",
            "merchant_name": "Test Store",
            "amount": 1.0,
            "currency": "USD",
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
    resp = client.post("/api/v1/expenses/with_items", json=payload)
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["expense_id"]
    assert len(fake_repo.expenses) == 1
    # idempotency
    resp2 = client.post("/api/v1/expenses/with_items", json=payload)
    assert resp2.status_code == 409
