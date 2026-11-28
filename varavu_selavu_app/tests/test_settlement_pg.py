"""Real concurrency needs PostgreSQL: SQLite ignores row locks (TS-FIX-104, AC-003 and AC-005).

Without a lock, eight concurrent "settle my share" requests recorded eight settlements.
"""
import os
import threading
import uuid
from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DB_URL = os.environ.get("E2E_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DB_URL, reason="Requires E2E_DATABASE_URL containing a PostgreSQL connection string")

from varavu_selavu_service.db import models as m  # noqa: E402
from varavu_selavu_service.db.session import Base  # noqa: E402
from varavu_selavu_service.services.group_expense_service import GroupExpenseService  # noqa: E402
from varavu_selavu_service.services.settlement_service import SettlementService  # noqa: E402

AT_ONCE = 8


@pytest.fixture(scope="module")
def sessions():
    engine = create_engine(DB_URL, pool_size=AT_ONCE + 4)
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS trackspense"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    Base.metadata.create_all(bind=engine)
    yield sessionmaker(bind=engine, autocommit=False, autoflush=False)  # as db/session.py
    engine.dispose()


@pytest.fixture
def group(sessions):
    db = sessions()
    email = f"race-{uuid.uuid4().hex[:10]}@test.com"
    db.add(m.User(email=email, name="R", password_hash="x", email_verified=True))
    db.commit()
    row = m.Group(id=uuid.uuid4(), name="Race", created_by=email)
    db.add(row)
    db.commit()
    payer = m.GroupMember(id=uuid.uuid4(), group_id=row.id, user_email=email, display_name="A", role="admin", status="active")
    other = m.GroupMember(id=uuid.uuid4(), group_id=row.id, display_name="B", role="member", status="active")
    db.add_all([payer, other])
    db.commit()
    yield db, email, row.id, payer.id, other.id
    db.close()


def _at_once(sessions, work):
    gate, results = threading.Barrier(AT_ONCE), []

    def one():
        session = sessions()
        try:
            service = SettlementService(session)
            gate.wait(timeout=30)
            results.append(("ok", work(service)))
        except Exception as error:  # noqa: BLE001 - the outcome is what is asserted
            results.append(("error", getattr(error, "status_code", type(error).__name__)))
        finally:
            session.close()

    threads = [threading.Thread(target=one) for _ in range(AT_ONCE)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    return results


def _count(db, group_id):
    db.expire_all()
    return db.query(m.Settlement).filter(m.Settlement.group_id == group_id).count()


def test_one_request_sent_many_times_at_once_is_stored_once(sessions, group):
    db, email, gid, payer, other = group

    results = _at_once(sessions, lambda s: s.create_settlement(str(gid), email, str(other), str(payer), 20.0, request_id="pg-race-0001"))

    assert [kind for kind, _ in results] == ["ok"] * AT_ONCE, results
    assert len({value["id"] for _, value in results}) == 1
    assert sum(1 for _, value in results if not value.get("replayed")) == 1
    assert _count(db, gid) == 1


def test_one_share_settled_many_times_at_once_records_one_payment(sessions, group):
    db, email, gid, payer, other = group
    expense = m.Expense(id=uuid.uuid4(), user_email=email, group_id=gid, purchased_at=datetime(2026, 11, 20),
                        description="d", category_id="Food", amount=Decimal("10.00"), split_type="equal")
    db.add(expense)
    db.commit()
    db.add_all([m.ExpensePayer(expense_id=expense.id, member_id=payer, amount_paid=Decimal("10.00")),
                m.ExpenseSplit(expense_id=expense.id, member_id=other, amount_owed=Decimal("5.00"), basis_type="equal")])
    db.commit()
    expense_id = str(expense.id)

    results = _at_once(sessions, lambda s: s.settle_expense_share(str(gid), expense_id, email, str(other)))

    assert sorted(str(value) if kind == "error" else "ok" for kind, value in results) == ["409"] * (AT_ONCE - 1) + ["ok"]
    assert _count(db, gid) == 1


def _shared_expense(db, email, gid, payer, other):
    expense = m.Expense(id=uuid.uuid4(), user_email=email, group_id=gid, purchased_at=datetime(2026, 11, 20),
                        description="d", category_id="Food", amount=Decimal("10.00"), split_type="equal")
    db.add(expense)
    db.commit()
    db.add_all([m.ExpensePayer(expense_id=expense.id, member_id=payer, amount_paid=Decimal("10.00")),
                m.ExpenseSplit(expense_id=expense.id, member_id=other, amount_owed=Decimal("10.00"), basis_type="equal")])
    db.commit()
    return str(expense.id)


def _overlap(sessions, held, waiting):
    """Runs `held` up to its commit, starts `waiting` into it, then lets `held` commit."""
    ready, finished, results = threading.Event(), threading.Event(), {}

    def run(name, work, pause):
        session = sessions()
        if pause:
            real_commit = session.commit

            def commit_late():
                session.flush()
                session.commit = real_commit
                ready.set()
                finished.wait(timeout=2)  # let the other request run into the open transaction
                real_commit()

            session.commit = commit_late
        try:
            work(session)
            results[name] = "ok"
        except Exception as error:  # noqa: BLE001 - the outcome is what is asserted
            results[name] = getattr(error, "status_code", None) or repr(error)[:300]
        finally:
            if not pause:
                finished.set()
            session.close()

    first = threading.Thread(target=run, args=("held", held, True))
    first.start()
    assert ready.wait(timeout=30), results
    second = threading.Thread(target=run, args=("waiting", waiting, False))
    second.start()
    first.join(timeout=60)
    second.join(timeout=60)
    return results


def _pay(gid, expense_id, email, member):
    return lambda s: SettlementService(s).settle_expense_share(str(gid), expense_id, email, str(member))


def _rename(gid, expense_id, email):
    return lambda s: GroupExpenseService(s).update_expense(
        str(gid), expense_id, email, "11/20/2026", "renamed", "Food", 10.0, None, None, None, None)


def _new_total(gid, expense_id, email):
    return lambda s: GroupExpenseService(s).update_items(
        str(gid), expense_id, email, [{"line_no": 1, "item_name": "Meal", "line_total": 12, "original_price": 12}], 12)


def _share(db, expense_id):
    db.expire_all()
    return db.query(m.ExpenseSplit).filter(m.ExpenseSplit.expense_id == uuid.UUID(expense_id)).one()


@pytest.mark.parametrize("edit", [_rename, _new_total])
def test_a_share_paid_while_the_expense_is_being_edited_stays_paid(sessions, group, edit):
    """The edit starts before the payment commits, so it must wait to see the paid mark."""
    db, email, gid, payer, other = group
    expense_id = _shared_expense(db, email, gid, payer, other)

    results = _overlap(sessions, _pay(gid, expense_id, email, other), edit(gid, expense_id, email))

    assert results == {"held": "ok", "waiting": "ok"}
    assert _share(db, expense_id).settled_via_settlement_id is not None


@pytest.mark.parametrize("second_edit", [_rename, _new_total])
def test_two_edits_at_once_keep_the_paid_mark(sessions, group, second_edit):
    db, email, gid, payer, other = group
    expense_id = _shared_expense(db, email, gid, payer, other)
    SettlementService(db).settle_expense_share(str(gid), expense_id, email, str(other))

    results = _overlap(sessions, _rename(gid, expense_id, email), second_edit(gid, expense_id, email))

    assert results == {"held": "ok", "waiting": "ok"}
    assert _share(db, expense_id).settled_via_settlement_id is not None


def test_a_payment_that_arrives_during_an_edit_is_recorded(sessions, group):
    db, email, gid, payer, other = group
    expense_id = _shared_expense(db, email, gid, payer, other)

    results = _overlap(sessions, _rename(gid, expense_id, email), _pay(gid, expense_id, email, other))

    assert results == {"held": "ok", "waiting": "ok"}
    assert _share(db, expense_id).settled_via_settlement_id is not None
    assert _count(db, gid) == 1


def test_undoing_a_payment_during_an_edit_does_not_deadlock(sessions, group):
    db, email, gid, payer, other = group
    expense_id = _shared_expense(db, email, gid, payer, other)
    paid = str(SettlementService(db).settle_expense_share(str(gid), expense_id, email, str(other))["id"])

    results = _overlap(sessions, _rename(gid, expense_id, email),
                       lambda s: SettlementService(s).delete_settlement(str(gid), email, paid))

    assert results == {"held": "ok", "waiting": "ok"}
    assert _share(db, expense_id).settled_via_settlement_id is None
    assert _count(db, gid) == 0
