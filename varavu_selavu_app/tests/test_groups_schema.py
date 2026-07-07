import pytest
from sqlalchemy.exc import IntegrityError
from varavu_selavu_service.db.models import (
    User, Group, GroupMember, Expense, ExpensePayer, ExpenseSplit, Settlement
)
from varavu_selavu_service.db.session import SessionLocal

def test_groups_schema_unique_constraints(db_session):
    # Setup test users
    user_a = User(email="a@test.com", password_hash="hash", name="User A")
    user_b = User(email="b@test.com", password_hash="hash", name="User B")
    db_session.add_all([user_a, user_b])
    db_session.commit()

    # Create Group
    group = Group(name="Test Group", created_by=user_a.email)
    db_session.add(group)
    db_session.commit()

    # Create Members
    member_a = GroupMember(group_id=group.id, user_email=user_a.email, display_name="A")
    member_b = GroupMember(group_id=group.id, user_email=user_b.email, display_name="B")
    db_session.add_all([member_a, member_b])
    db_session.commit()

    # Test unique constraint on group_members (group_id, user_email)
    dup_member = GroupMember(group_id=group.id, user_email=user_a.email, display_name="A2")
    db_session.add(dup_member)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Create Expense
    expense = Expense(
        user_email=user_a.email,
        group_id=group.id,
        split_type="equal",
        category_id="test",
        amount=100.00
    )
    db_session.add(expense)
    db_session.commit()

    # Create Payer and Split
    payer = ExpensePayer(expense_id=expense.id, member_id=member_a.id, amount_paid=100.00)
    split = ExpenseSplit(expense_id=expense.id, member_id=member_b.id, amount_owed=100.00, basis_type="equal")
    db_session.add_all([payer, split])
    db_session.commit()

    # Test unique constraint on expense_payers
    dup_payer = ExpensePayer(expense_id=expense.id, member_id=member_a.id, amount_paid=50.00)
    db_session.add(dup_payer)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Test unique constraint on expense_splits
    dup_split = ExpenseSplit(expense_id=expense.id, member_id=member_b.id, amount_owed=50.00, basis_type="equal")
    db_session.add(dup_split)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Test Settlement from != to constraint
    # Note: SQLite check constraints only work if enabled or enforced, but SQLAlchemy schema 
    # creates it. If SQLite doesn't enforce CHECK out of the box, we might skip the assertion 
    # or rely on Postgres for this. Let's try it.
    settlement = Settlement(
        group_id=group.id,
        from_member_id=member_a.id,
        to_member_id=member_a.id, # invalid
        amount=50.00
    )
    db_session.add(settlement)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

def test_e12_regression_account_deletion_survives(db_session):
    # Create user A and B
    user_a = User(email="e12_a@test.com", password_hash="hash", name="User A")
    user_b = User(email="e12_b@test.com", password_hash="hash", name="User B")
    db_session.add_all([user_a, user_b])
    db_session.commit()

    # Create Group authored by A
    group = Group(name="E12 Group", created_by=user_a.email)
    db_session.add(group)
    db_session.commit()

    # Add A and B to group
    member_a = GroupMember(group_id=group.id, user_email=user_a.email, display_name="A")
    member_b = GroupMember(group_id=group.id, user_email=user_b.email, display_name="B")
    db_session.add_all([member_a, member_b])
    db_session.commit()
    
    member_a_id = member_a.id

    # Create group expense authored by A
    expense = Expense(
        user_email=user_a.email,
        group_id=group.id,
        split_type="equal",
        category_id="test",
        amount=100.00
    )
    db_session.add(expense)
    db_session.commit()
    expense_id = expense.id

    # Add splits for A and B, payer A
    payer = ExpensePayer(expense_id=expense.id, member_id=member_a.id, amount_paid=100.00)
    split_a = ExpenseSplit(expense_id=expense.id, member_id=member_a.id, amount_owed=50.00, basis_type="equal")
    split_b = ExpenseSplit(expense_id=expense.id, member_id=member_b.id, amount_owed=50.00, basis_type="equal")
    db_session.add_all([payer, split_a, split_b])
    db_session.commit()

    # Delete User A
    db_session.delete(user_a)
    db_session.commit()

    # Assert group expense, expense_splits, and expense_payers still exist
    exp = db_session.query(Expense).filter(Expense.id == expense_id).first()
    assert exp is not None
    assert exp.user_email is None  # ON DELETE SET NULL

    s_a = db_session.query(ExpenseSplit).filter(ExpenseSplit.member_id == member_a_id).first()
    assert s_a is not None

    p_a = db_session.query(ExpensePayer).filter(ExpensePayer.member_id == member_a_id).first()
    assert p_a is not None

    # Assert A's group_members row is now a placeholder (user_email IS NULL)
    m_a = db_session.query(GroupMember).filter(GroupMember.id == member_a_id).first()
    assert m_a is not None
    assert m_a.user_email is None

    # Assert group creator is NULL
    grp = db_session.query(Group).filter(Group.id == group.id).first()
    assert grp.created_by is None
