"""search_expenses chat tool: individual-transaction lookup for "when did I pay for X?"."""
import uuid
from datetime import datetime, timezone

from varavu_selavu_service.db.models import Expense, Group, GroupMember, User
from varavu_selavu_service.services.chat_service import _search_expenses_for_agent

ME = "test@user.com"


def _exp(db, desc, amount, when, merchant=None, user=ME, group_id=None):
    db.add(Expense(
        id=uuid.uuid4(), user_email=user, purchased_at=datetime(*when, 12, tzinfo=timezone.utc),
        category_id="Shopping", amount=amount, description=desc, merchant_name=merchant, group_id=group_id,
    ))
    db.commit()


def test_finds_a_specific_purchase_with_its_date(db_session):
    _exp(db_session, "Porkbun domain renewal cerebroos", 11.06, (2026, 8, 16))
    _exp(db_session, "Groceries", 40, (2026, 8, 17), merchant="Whole Foods")
    out = _search_expenses_for_agent(db_session, ME, "porkbun")
    assert "2026-08-16: Porkbun domain renewal cerebroos — $11.06" in out
    assert "Groceries" not in out


def test_matches_merchant_and_requires_every_word(db_session):
    _exp(db_session, "Coffee", 5, (2026, 9, 1), merchant="Blue Bottle")
    _exp(db_session, "Bottle of water", 2, (2026, 9, 2))
    assert "Blue Bottle" in _search_expenses_for_agent(db_session, ME, "blue bottle")
    assert "Bottle of water" not in _search_expenses_for_agent(db_session, ME, "blue bottle")


def test_newest_first_and_date_bounds_inclusive(db_session):
    for m in (3, 5, 7):
        _exp(db_session, f"Netflix {m}", 15.49, (2026, m, 10))
    out = _search_expenses_for_agent(db_session, ME, "netflix")
    assert out.index("Netflix 7") < out.index("Netflix 5") < out.index("Netflix 3")
    bounded = _search_expenses_for_agent(db_session, ME, "netflix", start_date="2026-05-10", end_date="2026-07-10")
    assert "Netflix 5" in bounded and "Netflix 7" in bounded and "Netflix 3" not in bounded


def test_never_returns_another_users_expenses(db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@test.com", password_hash="h", name="O"))
    db_session.commit()
    _exp(db_session, "Porkbun domain", 11, (2026, 8, 16), user="other@test.com")
    assert "No expenses matching" in _search_expenses_for_agent(db_session, ME, "porkbun")


def test_group_expenses_only_when_groups_enabled(db_session):
    group = Group(id=uuid.uuid4(), name="Trip", created_by=ME)
    db_session.add(group)
    db_session.commit()
    db_session.add(GroupMember(group_id=group.id, user_email=ME, display_name="Me", role="admin"))
    db_session.commit()
    _exp(db_session, "Airbnb Lisbon", 600, (2026, 6, 1), group_id=group.id)
    assert "No expenses matching" in _search_expenses_for_agent(db_session, ME, "airbnb")
    out = _search_expenses_for_agent(db_session, ME, "airbnb", include_groups=True)
    assert "Airbnb Lisbon" in out and "(group: Trip, full amount)" in out


def test_limit_and_empty_query(db_session):
    for d in range(1, 15):
        _exp(db_session, "Uber ride", 10, (2026, 9, d))
    out = _search_expenses_for_agent(db_session, ME, "uber", limit=3)
    assert out.count("Uber ride") == 3 and "showing the 3 most recent" in out
    assert "Give me a word" in _search_expenses_for_agent(db_session, ME, "   ")


def test_search_expenses_is_registered_with_the_agent(monkeypatch):
    """Defining the @tool isn't enough: it has to be in the list handed to create_react_agent
    (it wasn't, at first, and the prompt then told the model to call a tool it didn't have)."""
    from unittest.mock import MagicMock
    from varavu_selavu_service.services import chat_service

    captured = {}

    def fake_agent(llm, tools, prompt=None):
        captured["names"] = [t.name for t in tools]
        agent = MagicMock()
        agent.stream.return_value = iter([])
        return agent

    monkeypatch.setattr(chat_service, "create_react_agent", fake_agent)
    monkeypatch.setattr(chat_service, "ChatGoogleGenerativeAI", MagicMock())
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    svc = MagicMock()
    svc.analyze.return_value = {}
    try:
        chat_service.call_chat_model(
            messages=[{"role": "user", "content": "when did I pay porkbun?"}],
            user_id=ME, analysis_service=svc, analytics_service=MagicMock(), insight_service=MagicMock(),
            expense_service=MagicMock(),
        )
    except Exception:
        pass  # the fake agent yields nothing; only the tool list matters here
    assert "search_expenses" in captured["names"]


def test_merchant_detail_lookup_is_case_insensitive(db_session):
    """The agent asked for "porkbun"; the merchant is stored as "Porkbun". The exact,
    case-sensitive match returned nothing and the model concluded the user never paid."""
    from varavu_selavu_service.db.models import MerchantInsight
    from varavu_selavu_service.services.analytics_service import AnalyticsService
    db_session.add(MerchantInsight(id=uuid.uuid4(), user_email=ME, merchant_name="Porkbun", total_spent=11.08, transaction_count=1))
    db_session.commit()
    detail = AnalyticsService(db_session).get_merchant_detail(user_email=ME, merchant_name="porkbun")
    assert detail is not None


def test_falls_back_to_receipt_line_items_with_store_and_price(db_session):
    """Regression: "Where did I buy eggs cheapest?" found nothing because eggs only appear as
    receipt line items, never in an expense description."""
    from varavu_selavu_service.db.models import ExpenseItem
    for store, price, day in [("Safeway", 4.19, 1), ("Costco", 3.49, 8)]:
        exp = Expense(
            id=uuid.uuid4(), user_email=ME, purchased_at=datetime(2026, 9, day, 12, tzinfo=timezone.utc),
            category_id="Groceries", amount=price, description=f"Groceries at {store}", merchant_name=store,
            split_type="itemized",
        )
        db_session.add(exp)
        db_session.add(ExpenseItem(id=uuid.uuid4(), expense_id=exp.id, user_email=ME, line_no=1,
                                   item_name="Eggs (dozen)", normalized_name="Eggs (dozen)",
                                   line_total=price, unit_price=price, quantity=1))
    db_session.commit()
    out = _search_expenses_for_agent(db_session, ME, "eggs")
    assert "receipt line items" in out
    assert "2026-09-08: Eggs (dozen) at Costco — $3.49" in out
    assert "2026-09-01: Eggs (dozen) at Safeway — $4.19" in out
