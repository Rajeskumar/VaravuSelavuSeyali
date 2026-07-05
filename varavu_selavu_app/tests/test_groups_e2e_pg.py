"""
tests/test_groups_e2e_pg.py — TS-GRP-111 Phase-1 e2e, Postgres variant.

Mirrors tests/test_analytics_e2e_pg.py's structure exactly: reads
E2E_DATABASE_URL, skips the whole module if it isn't set, builds its own
engine/session (not conftest.py's SQLite fixtures), and overrides
auth_required/get_db directly. Run via run_e2e_pg_tests.sh.
"""
import os
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

DB_URL = os.environ.get("E2E_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DB_URL, reason="Requires E2E_DATABASE_URL environment variable containing PostgreSQL connection string"
)

if DB_URL:
    os.environ["DATABASE_URL"] = DB_URL
    os.environ["GROUPS_ENABLED"] = "true"

from varavu_selavu_service.main import app
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import User, Group, GroupMember, Expense, ExpensePayer, ExpenseSplit, Settlement
from varavu_selavu_service.services.analysis_service import AnalysisService

try:
    engine = create_engine(DB_URL, execution_options={"schema_translate_map": {"trackspense": "trackspense"}}) if DB_URL else None
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception:
    pass

E2E_USER = "groups_e2e@test.com"


def override_auth():
    return E2E_USER


def override_get_db_pg():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


if DB_URL:
    app.dependency_overrides[auth_required] = override_auth
    app.dependency_overrides[get_db] = override_get_db_pg


@pytest.fixture(scope="module")
def db_session_real():
    db = TestingSessionLocal()

    from sqlalchemy.dialects.postgresql import insert

    u_stmt = insert(User).values(id=uuid.uuid4(), email=E2E_USER, password_hash="hash", name="Groups E2E").on_conflict_do_nothing()
    db.execute(u_stmt)
    db.commit()

    yield db

    # Teardown — group rows cascade (expense_payers/expense_splits/settlements/
    # group_members ON DELETE CASCADE from groups), so deleting groups created by
    # this user is enough; the Expense rows they authored cascade too.
    groups = db.query(Group).filter(Group.created_by == E2E_USER).all()
    for g in groups:
        db.query(Expense).filter(Expense.group_id == g.id).delete()
        db.query(GroupMember).filter(GroupMember.group_id == g.id).delete()
        db.delete(g)
    db.query(User).filter(User.email == E2E_USER).delete()
    db.commit()
    db.close()


client = TestClient(app)


def test_pg_group_expense_double_count_guard_and_settlement_invariant(db_session_real):
    """Postgres-backed smoke test for stories 2/4/5's money-math invariants —
    the SQLite suite (tests/test_groups_e2e.py) covers the full story set in
    detail; this just proves the same invariants hold against real Postgres."""
    AnalysisService(db_session_real).invalidate_cache()

    create_res = client.post("/api/v1/groups", json={"name": "PG E2E Group"})
    assert create_res.status_code == 201
    group_id = create_res.json()["group_id"]

    group = db_session_real.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    admin_member = (
        db_session_real.query(GroupMember)
        .filter(GroupMember.group_id == group.id, GroupMember.user_email == E2E_USER)
        .first()
    )
    admin_id = str(admin_member.id)

    other_member = GroupMember(group_id=group.id, user_email=None, display_name="Placeholder Friend", status="invited")
    db_session_real.add(other_member)
    db_session_real.commit()
    other_id = str(other_member.id)

    expense_res = client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "PG Groceries",
            "category": "Food & Drink",
            "amount": 100.00,
            "payers": [{"member_id": admin_id, "amount_paid": 100.00}],
            "split": {"type": "equal", "entries": [{"member_id": admin_id}, {"member_id": other_id}]},
        },
    )
    assert expense_res.status_code == 201
    assert expense_res.json()["expense"]["my_share"] == 50.00

    # Double-count guard: combined /analysis shows only the actor's $50 share, not $100.
    analysis_res = client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "scope": "combined"})
    assert analysis_res.status_code == 200
    assert analysis_res.json()["total_expenses"] == 50.00

    # Balances: Σ net(m) == 0.
    balances_res = client.get(f"/api/v1/groups/{group_id}/balances")
    assert balances_res.status_code == 200
    net_sum = round(sum(m["net"] for m in balances_res.json()["members"]), 2)
    assert net_sum == 0.0

    # Settle up: balances zero out, spend analytics unchanged (TS-GRP-R2).
    settle_res = client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": other_id, "to_member_id": admin_id, "amount": 50.00},
    )
    assert settle_res.status_code == 201

    balances_after = client.get(f"/api/v1/groups/{group_id}/balances")
    net_sum_after = round(sum(m["net"] for m in balances_after.json()["members"]), 2)
    assert net_sum_after == 0.0
    admin_net_after = next(m["net"] for m in balances_after.json()["members"] if m["member_id"] == admin_id)
    assert admin_net_after == 0.0

    analysis_after = client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "scope": "combined"})
    assert analysis_after.json()["total_expenses"] == 50.00  # unchanged by the settlement


def test_pg_flag_off_returns_404_for_groups(db_session_real):
    old_val = os.environ.get("GROUPS_ENABLED")
    os.environ["GROUPS_ENABLED"] = "false"
    try:
        res = client.get("/api/v1/groups")
        assert res.status_code == 404
    finally:
        os.environ["GROUPS_ENABLED"] = old_val if old_val is not None else "true"
