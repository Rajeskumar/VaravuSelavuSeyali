from fastapi.testclient import TestClient
from unittest.mock import patch, Mock


def test_list_expenses():
    with patch("varavu_selavu_service.db.google_sheets.GoogleSheetsClient._create_client"):
        from varavu_selavu_service.main import app
        from varavu_selavu_service.auth.security import auth_required
        from varavu_selavu_service.api import routes
        app.dependency_overrides[auth_required] = lambda: "u1"
        svc = Mock()
        svc.get_expenses_for_user.return_value = [
            {
                "row_id": 2,
                "user_id": "u1",
                "date": "01/01/2024",
                "description": "Coffee",
                "category": "Food & Drink",
                "cost": 3.5,
            },
            {
                "row_id": 3,
                "user_id": "u1",
                "date": "01/02/2024",
                "description": "Lunch",
                "category": "Food & Drink",
                "cost": 12.0,
            },
        ]
        app.dependency_overrides[routes.get_expense_service] = lambda: svc
        client = TestClient(app)
        res = client.get("/api/v1/expenses", params={"user_id": "u1", "limit": 1})
        assert res.status_code == 200
        data = res.json()
        # Should return most recent first
        assert data["items"][0]["description"] == "Lunch"
        assert data["next_offset"] == 1
