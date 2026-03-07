from unittest.mock import patch
from varavu_selavu_service.services.categorization_service import CategorizationService

def test_semantic_classification(test_client):
    with patch.object(
        CategorizationService,
        "llm_classify",
        return_value=("Food & Drink", "Dining out"),
    ):
        res = test_client.post(
            "/api/v1/expenses/categorize",
            json={"description": "subway dinner"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["main_category"] == "Food & Drink"
        assert data["subcategory"] == "Dining out"


def test_default_when_unknown(test_client):
    with patch.object(
        CategorizationService, 
        "llm_classify", 
        return_value=None
    ):
        res = test_client.post(
            "/api/v1/expenses/categorize",
            json={"description": "mystery payment"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["main_category"] == "Other"
        assert data["subcategory"] == "General"
