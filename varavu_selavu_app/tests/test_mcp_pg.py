"""Real PostgreSQL transactions: no SQLite stand-in for row locks or precision."""

import os
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import threading
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from varavu_selavu_service.db.session import Base
from varavu_selavu_service.db.models import Expense, ExpenseItem, User
from varavu_selavu_service.db.mcp_models import (
    MCPGlobal,
    MCPRateCounter,
    MCPOperation,
    OAuthClient,
)
from varavu_selavu_service.mcp.operations import verify, save, decide
from varavu_selavu_service.mcp.security import revoke_connections, MCPError
from test_mcp import mcp as seed, draft, approved, DRAFT_DATE

URL = os.environ.get("E2E_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not URL, reason="Requires a dedicated E2E_DATABASE_URL PostgreSQL database"
)


@pytest.fixture
def pg(monkeypatch):
    engine = create_engine(URL, pool_size=6)
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS trackspense"))
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    with factory() as db:
        # Tests use one reserved account; all financial data is isolated from other tests.
        db.query(User).filter_by(email="mcp@example.com").delete()
        db.query(MCPGlobal).delete()
        db.query(OAuthClient).filter_by(client_id="test-client").delete()
        db.commit()
        _, p, c = seed.__wrapped__(db, monkeypatch)
        yield factory, p
        db.rollback()
        db.query(User).filter_by(email=p.user_email).delete()
        db.query(MCPGlobal).delete()
        db.query(OAuthClient).filter_by(client_id="test-client").delete()
        db.commit()
    engine.dispose()


def race(factory, functions):
    barrier = threading.Barrier(len(functions))

    def run(fn):
        with factory() as db:
            barrier.wait(timeout=5)
            try:
                result = fn(db)
                db.commit()
                return result
            except MCPError as exc:
                db.rollback()
                return exc.code

    with ThreadPoolExecutor(max_workers=len(functions)) as pool:
        return list(pool.map(run, functions))


def test_pg_same_key_and_exactly_once_save(pg):
    factory, p = pg
    results = race(
        factory, [lambda db: verify(db, p, draft()), lambda db: verify(db, p, draft())]
    )
    assert results[0]["operation_id"] == results[1]["operation_id"]
    oid = results[0]["operation_id"]
    with factory() as db:
        decide(db, p.user_email, oid, 1, True, True, "session")
        db.commit()
    results = race(factory, [lambda db: save(db, p, oid), lambda db: save(db, p, oid)])
    assert {r["status"] for r in results} == {"committed"}
    with factory() as db:
        assert db.query(Expense).filter_by(user_email=p.user_email).count() == 1
        assert (
            db.query(MCPRateCounter)
            .filter_by(subject="connection:" + p.connection_id, bucket="creates")
            .one()
            .count
            == 1
        )


def test_pg_different_operations_new_duplicate(pg):
    factory, p = pg
    with factory() as db:
        a = approved(db, p)
        b = approved(db, p, "draft-key-00000002")
    results = race(factory, [lambda db: save(db, p, a), lambda db: save(db, p, b)])
    assert sorted(r["status"] for r in results) == ["committed", "pending_approval"]


def test_pg_revocation_serializes_with_save(pg):
    factory, p = pg
    with factory() as db:
        oid = approved(db, p)
    race(
        factory,
        [
            lambda db: save(db, p, oid),
            lambda db: revoke_connections(db, p.user_email, "test"),
        ],
    )
    with factory() as db:
        count = db.query(Expense).filter_by(user_email=p.user_email).count()
        assert count in (0, 1)
        with pytest.raises(MCPError):
            save(db, p, oid)
        assert db.query(Expense).filter_by(user_email=p.user_email).count() == count


def test_pg_quantity_exact_roundtrip(pg):
    factory, p = pg
    with factory() as db:
        value = draft(
            kind="itemized",
            amount=None,
            total="2.50",
            merchant="Farm",
            items=[
                {
                    "name": "Apples",
                    "quantity": "1.250",
                    "unit_price": "2.00",
                    "line_total": "2.50",
                }
            ],
        )
        result = verify(db, p, value)
        db.commit()
        decide(db, p.user_email, result["operation_id"], 1, True, True, "session")
        db.commit()
        save(db, p, result["operation_id"])
        db.commit()
        assert db.query(ExpenseItem).join(Expense).filter(
            Expense.user_email == p.user_email
        ).one().quantity == Decimal("1.250")


def test_pg_first_party_create_forces_duplicate_review(pg):
    factory, p = pg
    with factory() as db:
        oid = approved(db, p)
    from varavu_selavu_service.services.expense_service import ExpenseService

    inserted = threading.Event()
    release = threading.Event()

    def first_party():
        with factory() as db:
            ExpenseService(db).add_expense(
                p.user_email,
                DRAFT_DATE,
                "Lunch",
                "Dining out",
                Decimal("12.34"),
                commit=False,
            )
            inserted.set()
            assert release.wait(5)
            db.commit()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(first_party)
        assert inserted.wait(5)

        def mcp_save():
            with factory() as db:
                result = save(db, p, oid)
                db.commit()
                return result

        pending = pool.submit(mcp_save)
        release.set()
        first.result(5)
        result = pending.result(5)
    assert result["status"] == "pending_approval"
    with factory() as db:
        assert db.query(Expense).filter_by(user_email=p.user_email).count() == 1


def test_pg_atomic_quota_boundary(pg):
    factory, p = pg
    from varavu_selavu_service.mcp.rate_limit import reserve

    def attempt(db):
        reserve(
            db,
            "connection:" + p.connection_id,
            "race_test",
            60,
            1,
            user_email=p.user_email,
        )
        return "accepted"

    results = race(factory, [attempt, attempt])
    assert sorted(results) == ["accepted", "rate_limited"]


def test_pg_approval_read_cannot_overwrite_committed_save(pg, monkeypatch):
    from datetime import timedelta
    from varavu_selavu_service.mcp import operations
    from varavu_selavu_service.oauth.routes import approval_info

    factory, p = pg
    before = operations.utcnow()
    with factory() as db:
        oid = approved(db, p)
        db.get(MCPOperation, oid).expires_at = before + timedelta(seconds=1)
        db.commit()
    monkeypatch.setattr(operations, "utcnow", lambda: before)
    read = threading.Event()
    original_output = operations.output

    def observed_output(*args, **kwargs):
        result = original_output(*args, **kwargs)
        read.set()
        return result

    monkeypatch.setattr("varavu_selavu_service.oauth.routes.output", observed_output)
    with factory() as writer, ThreadPoolExecutor(max_workers=1) as pool:
        assert save(writer, p, oid)["status"] == "committed"
        monkeypatch.setattr(operations, "utcnow", lambda: before + timedelta(seconds=2))

        def browser_read():
            with factory() as reader:
                return approval_info(oid, p.user_email, reader)

        pending = pool.submit(browser_read)
        try:
            assert read.wait(5)
        finally:
            writer.commit()
        pending.result(5)
    with factory() as db:
        assert db.get(MCPOperation, oid).status == "committed"
        assert approval_info(oid, p.user_email, db)["status"] == "committed"
        assert db.query(Expense).filter_by(user_email=p.user_email).count() == 1
