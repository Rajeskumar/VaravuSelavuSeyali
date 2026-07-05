import uuid
from datetime import datetime

from varavu_selavu_service.db.models import (
    User, Group, GroupMember, Expense, ExpenseItem, ExpensePayer, ExpenseSplit
)


def test_delete_account_hard_deletes_personal_expenses_only(test_client, db_session):
    # "test@user.com" is the seeded default user; auth_required is overridden to it.
    personal = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        purchased_at=datetime(2024, 1, 1),
        category_id="Misc",
        amount=10.0,
        description="Coffee",
    )
    db_session.add(personal)
    db_session.commit()
    personal_id = personal.id

    res = test_client.delete("/api/v1/auth/profile")
    assert res.status_code == 200
    assert res.json() == {"success": True}

    assert db_session.query(Expense).filter(Expense.id == personal_id).first() is None
    assert db_session.query(User).filter(User.email == "test@user.com").first() is None


def test_delete_account_anonymizes_group_history(test_client, db_session):
    other = User(id=uuid.uuid4(), email="other@test.com", password_hash="hash", name="Other User")
    db_session.add(other)
    db_session.commit()

    group = Group(name="Trip", created_by="test@user.com")
    db_session.add(group)
    db_session.commit()

    member_me = GroupMember(group_id=group.id, user_email="test@user.com", display_name="Test User", role="admin")
    member_other = GroupMember(group_id=group.id, user_email="other@test.com", display_name="Other User")
    db_session.add_all([member_me, member_other])
    db_session.commit()
    member_me_id = member_me.id
    group_id = group.id

    group_expense = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        group_id=group.id,
        split_type="equal",
        purchased_at=datetime(2024, 1, 5),
        category_id="Food & Drink",
        amount=100.0,
        description="Dinner",
    )
    db_session.add(group_expense)
    db_session.commit()
    group_expense_id = group_expense.id

    payer = ExpensePayer(expense_id=group_expense.id, member_id=member_me.id, amount_paid=100.0)
    split_me = ExpenseSplit(expense_id=group_expense.id, member_id=member_me.id, amount_owed=50.0, basis_type="equal")
    split_other = ExpenseSplit(expense_id=group_expense.id, member_id=member_other.id, amount_owed=50.0, basis_type="equal")
    db_session.add_all([payer, split_me, split_other])
    db_session.commit()

    # Also give the deleted user a personal expense in the same call
    personal = Expense(
        id=uuid.uuid4(),
        user_email="test@user.com",
        purchased_at=datetime(2024, 1, 6),
        category_id="Misc",
        amount=5.0,
        description="Snack",
    )
    db_session.add(personal)
    db_session.commit()
    personal_id = personal.id

    res = test_client.delete("/api/v1/auth/profile")
    assert res.status_code == 200

    # Personal expense: gone
    assert db_session.query(Expense).filter(Expense.id == personal_id).first() is None

    # Group expense + its splits/payer: survive, author anonymized
    exp = db_session.query(Expense).filter(Expense.id == group_expense_id).first()
    assert exp is not None
    assert exp.user_email is None

    assert db_session.query(ExpensePayer).filter(ExpensePayer.member_id == member_me_id).first() is not None
    assert db_session.query(ExpenseSplit).filter(ExpenseSplit.member_id == member_me_id).first() is not None

    # group_members row: anonymized, not deleted
    m = db_session.query(GroupMember).filter(GroupMember.id == member_me_id).first()
    assert m is not None
    assert m.user_email is None
    assert m.display_name == "Anonymous User"

    # group creator reference nulled
    grp = db_session.query(Group).filter(Group.id == group_id).first()
    assert grp.created_by is None
