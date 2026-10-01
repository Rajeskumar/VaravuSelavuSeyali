from unittest.mock import patch

from varavu_selavu_service.db.models import CategoryMemory
from varavu_selavu_service.services.categorization_service import CategorizationService

URL = "/api/v1/expenses/categorize"


def _categorize(client, description):
    res = client.post(URL, json={"description": description})
    assert res.status_code == 200
    return res.json()


def test_semantic_classification(test_client, db_session):
    # Nothing local matches, so the LLM tier answers.
    with patch.object(
        CategorizationService,
        "llm_classify",
        return_value=("Food & Drink", "Dining out", "Subway"),
    ):
        data = _categorize(test_client, "zqx vendor 42")
        assert data["main_category"] == "Food & Drink"
        assert data["subcategory"] == "Dining out"
        assert data["merchant_name"] == "Subway"
        assert data["source"] == "llm"


def test_default_when_unknown(test_client, db_session):
    with patch.object(
        CategorizationService,
        "llm_classify",
        return_value=None
    ):
        data = _categorize(test_client, "mystery payment")
        assert data["main_category"] == "Other"
        assert data["subcategory"] == "General"
        assert data["merchant_name"] is None
        assert data["source"] == "default"


def test_known_merchant_never_calls_the_llm(test_client, db_session):
    with patch.object(CategorizationService, "llm_classify") as llm:
        data = _categorize(test_client, "SQ *STARBUCKS #1234")
    llm.assert_not_called()
    assert (data["main_category"], data["subcategory"], data["merchant_name"], data["source"]) == (
        "Food & Drink", "Dining out", "Starbucks", "merchant",
    )


def test_keyword_rule_never_calls_the_llm(test_client, db_session):
    with patch.object(CategorizationService, "llm_classify") as llm:
        data = _categorize(test_client, "electric bill")
    llm.assert_not_called()
    assert (data["subcategory"], data["source"]) == ("Electricity", "keyword")


def test_llm_fallback_can_be_switched_off(test_client, db_session, monkeypatch):
    monkeypatch.setenv("CATEGORIZE_LLM_FALLBACK", "false")
    with patch.object(CategorizationService, "llm_classify") as llm:
        data = _categorize(test_client, "zqx vendor 42")
    llm.assert_not_called()
    assert data["source"] == "default"


def _create_expense(client, description, category, merchant=None):
    res = client.post(
        "/api/v1/expenses",
        json={
            "user_id": "test@user.com",
            "date": "09/01/2026",
            "description": description,
            "category": category,
            "cost": 12.5,
            "merchant_name": merchant,
        },
    )
    assert res.status_code == 201, res.text


def test_users_own_pick_beats_the_dictionary(test_client, db_session):
    # Costco is Groceries in the dictionary; this user files it under Household supplies.
    assert _categorize(test_client, "Costco")["subcategory"] == "Groceries"
    _create_expense(test_client, "Costco", "Household supplies", merchant="Costco Wholesale")
    data = _categorize(test_client, "costco")
    assert (data["main_category"], data["subcategory"], data["source"]) == ("Home", "Household supplies", "memory")
    # Remembered by merchant too, so a different description at the same store follows it.
    assert _categorize(test_client, "COSTCO WHSE #481")["subcategory"] == "Household supplies"


def test_memory_learns_unknown_descriptions_and_updates_on_edit(test_client, db_session):
    _create_expense(test_client, "zqx vendor 42", "Parking")
    data = _categorize(test_client, "ZQX Vendor 42")
    assert (data["main_category"], data["subcategory"], data["source"]) == ("Transportation", "Parking", "memory")

    _create_expense(test_client, "zqx vendor 42", "Parking")
    row = db_session.query(CategoryMemory).filter_by(user_email="test@user.com", key="zqx vendor 42").one()
    assert row.hits == 2

    _create_expense(test_client, "zqx vendor 42", "Electricity")
    db_session.expire_all()
    row = db_session.query(CategoryMemory).filter_by(user_email="test@user.com", key="zqx vendor 42").one()
    assert (row.main_category, row.category_id, row.hits) == ("Utilities", "Electricity", 1)


def test_general_fallback_is_not_remembered(test_client, db_session):
    _create_expense(test_client, "Starbucks", "General")
    assert _categorize(test_client, "Starbucks")["subcategory"] == "Dining out"
