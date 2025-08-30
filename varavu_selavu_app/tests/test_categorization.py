from varavu_selavu_service.services.categorization_service import CategorizationService
from unittest.mock import patch


def test_semantic_classification():
    svc = CategorizationService()
    with patch.object(
        CategorizationService,
        "llm_classify",
        side_effect=[("Food & Drink", "Dining out"), ("Entertainment", "Sports")],
    ):
        assert svc.classify("subway dinner") == ("Food & Drink", "Dining out")
        assert svc.classify("cricket team dues") == ("Entertainment", "Sports")


def test_default_when_unknown():
    svc = CategorizationService()
    with patch.object(CategorizationService, "llm_classify", return_value=None):
        assert svc.classify("mystery payment") == ("Other", "General")
