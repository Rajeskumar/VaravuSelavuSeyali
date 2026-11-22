"""Exercise the actual Alembic revisions against the immediately preceding schema.

The repository's older migration chain does not bootstrap an empty database. Build
that preceding schema from metadata with every new column/table removed, then run
Alembic from the explicit predecessor. All DDL rolls back inside a test transaction.
"""

import importlib.util
import os
from pathlib import Path
import pytest
from sqlalchemy import create_engine, MetaData, Numeric, text, inspect
from alembic.migration import MigrationContext
from alembic.operations import Operations
from varavu_selavu_service.db.session import Base
from varavu_selavu_service.db import models

URL = os.environ.get("E2E_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not URL, reason="Requires PostgreSQL for actual migration DDL"
)


def load(filename):
    spec = importlib.util.spec_from_file_location(
        "migration", Path(__file__).resolve().parents[1] / "alembic/versions" / filename
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_previous_schema_upgrade_downgrade_preserves_data():
    engine = create_engine(URL)
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            # Tests own the dedicated database; rollback restores all pre-test tables.
            conn.execute(text("DROP SCHEMA IF EXISTS trackspense CASCADE"))
            conn.execute(text("CREATE SCHEMA trackspense"))
            previous = MetaData()
            for table in Base.metadata.sorted_tables:
                if not table.name.startswith(("mcp_", "oauth_")):
                    table.to_metadata(previous)
            expenses = previous.tables["trackspense.expenses"]
            for constraint in list(expenses.constraints):
                if any(
                    col.name == "created_by_connection_id"
                    for col in getattr(constraint, "columns", [])
                ):
                    expenses.constraints.remove(constraint)
            for idx in list(expenses.indexes):
                if idx.name in (
                    "ix_expenses_personal_date",
                    "ix_expenses_duplicate_lookup",
                    "ix_trackspense_expenses_dup_fingerprint",
                ):
                    expenses.indexes.remove(idx)
            for fk in list(expenses.foreign_keys):
                if fk.parent.name == "created_by_connection_id":
                    expenses.foreign_keys.remove(fk)
            for name in ("created_by_connection_id", "dup_fingerprint"):
                expenses._columns.remove(expenses.c[name])
            refresh = previous.tables["trackspense.refresh_tokens"]
            refresh._columns.remove(refresh.c.authenticated_at)
            previous.tables["trackspense.expense_items"].c.quantity.type = Numeric(
                10, 2
            )
            previous.create_all(conn)
            conn.execute(
                text(
                    "INSERT INTO trackspense.users (id,email,password_hash,email_verified) VALUES ('00000000-0000-0000-0000-000000000001','migration@example.com','!',true)"
                )
            )
            foundation = load("b49a6c2df803_mcp_foundations.py")
            quantity = load("98f3d6b1a740_receipt_quantity_precision.py")
            with Operations.context(MigrationContext.configure(conn)):
                foundation.upgrade()
                quantity.upgrade()
                columns = {
                    c["name"]: c
                    for c in inspect(conn).get_columns(
                        "expense_items", schema="trackspense"
                    )
                }
                assert columns["quantity"]["type"].scale == 3
                assert any(
                    f["referred_table"] == "mcp_connections"
                    for f in inspect(conn).get_foreign_keys(
                        "expenses", schema="trackspense"
                    )
                )
                assert conn.scalar(text("SELECT count(*) FROM trackspense.users")) == 1
                quantity.downgrade()
                foundation.downgrade()
                assert "mcp_connections" not in inspect(conn).get_table_names(
                    schema="trackspense"
                )
                assert conn.scalar(text("SELECT count(*) FROM trackspense.users")) == 1
                foundation.upgrade()
                quantity.upgrade()
        finally:
            transaction.rollback()
    engine.dispose()
