"""get_item_insights fallback: "milk" should find the user's "Organic Milk" receipt items."""
import uuid
from datetime import datetime, timezone

from varavu_selavu_service.db.models import Expense, ExpenseItem, User
from varavu_selavu_service.services.chat_service import _matching_item_names

ME = "test@user.com"


def _receipt(db, items, user=ME, split_type="itemized"):
    exp = Expense(
        id=uuid.uuid4(), user_email=user, purchased_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        category_id="Groceries", amount=sum(p for _, p in items), description="Groceries",
        split_type=split_type,
    )
    db.add(exp)
    for i, (name, price) in enumerate(items, 1):
        db.add(ExpenseItem(id=uuid.uuid4(), expense_id=exp.id, user_email=user, line_no=i,
                           item_name=name, normalized_name=name, line_total=price, unit_price=price, quantity=1))
    db.commit()


def test_partial_name_finds_the_users_item(db_session):
    _receipt(db_session, [("Organic Milk", 4.99), ("Bananas", 1.89)])
    _receipt(db_session, [("Organic Milk", 5.19)])
    assert _matching_item_names(db_session, ME, "milk") == ["Organic Milk"]


def test_several_matches_are_all_returned_most_bought_first(db_session):
    _receipt(db_session, [("Oat Milk", 3.99), ("Organic Milk", 4.99)])
    _receipt(db_session, [("Organic Milk", 5.19)])
    assert _matching_item_names(db_session, ME, "MILK") == ["Organic Milk", "Oat Milk"]


def test_ignores_other_users_and_non_itemized_proxy_rows(db_session):
    db_session.add(User(id=uuid.uuid4(), email="someone@else.com", password_hash="x", name="Someone"))
    db_session.commit()
    _receipt(db_session, [("Organic Milk", 4.99)], user="someone@else.com")
    _receipt(db_session, [("Milk run", 9.00)], split_type=None)
    assert _matching_item_names(db_session, ME, "milk") == []
