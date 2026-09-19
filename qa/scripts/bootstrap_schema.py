#!/usr/bin/env python3
"""
Bootstraps a fresh TrackSpense Postgres database for QA use.

Run from `varavu_selavu_app/` with PYTHONPATH=. set (see bootstrap-local-db.sh and
.github/workflows/qa.yml — both invoke this the same way), and DATABASE_URL pointing at
an already-created, empty (but `trackspense` schema + pg_trgm-extension-having) database.

## Why this exists instead of `alembic upgrade head`

`alembic upgrade head` does NOT work against a truly empty database in this repo: the
root migration (`0f0766accf80_baseline_schema.py`, `down_revision = None`) only contains
ALTER/index-rename statements — it assumes `db/schema.sql` (the original 4-table schema)
was already applied by hand, exactly as the backend README's own setup steps say to do.
Beyond that, several later tables (`item_insights`, `item_price_history`,
`merchant_insights`, `merchant_aggregates`, ...) were added straight to the SQLAlchemy
models and were never given a corresponding `CREATE TABLE` migration at all — the
project's own `run_e2e_pg_tests.sh` works around exactly this by calling
`Base.metadata.create_all()` instead of running alembic for its Postgres e2e tests.

**This is a real gap worth flagging**, not just a QA-tooling inconvenience: `cloudbuild.yaml`'s
prod deploy pipeline runs bare `alembic upgrade head` against Cloud Run's Postgres, with no
`schema.sql` step. If that database were ever recreated from scratch, that step would fail
the same way it does here. See qa/TEST-PLAN.md's risk areas / this project's final QA report.

## What this script actually does

1. `Base.metadata.create_all()` — creates every table at its *current* (head) shape
   directly from the ORM models, sidestepping the broken incremental chain entirely.
2. `alembic stamp head` — marks the migration history as fully applied, so the app (and
   any future `alembic upgrade`) doesn't think there's pending work.
3. Replays just the one seed-data migration (`609704f8daf2_seed_card_catalog.py`) directly
   via Alembic's `Operations` API, bound to a fresh connection — it's pure `INSERT`s, so
   this is safe to run in isolation without walking the rest of the (broken) chain.
"""
import importlib.util
import os
import sys

from alembic import command
from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND_DIR = os.path.join(REPO_ROOT, "varavu_selavu_app")
SEED_MIGRATION_FILE = os.path.join(BACKEND_DIR, "alembic", "versions", "609704f8daf2_seed_card_catalog.py")


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL must be set", file=sys.stderr)
        sys.exit(1)

    from varavu_selavu_service.db.session import Base
    import varavu_selavu_service.db.models  # noqa: F401 — registers every table on Base.metadata

    engine = create_engine(database_url)
    print("==> Creating all tables from current ORM models (Base.metadata.create_all)")
    Base.metadata.create_all(bind=engine)

    print("==> Stamping alembic history as head (no migrations actually run)")
    alembic_cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    os.chdir(BACKEND_DIR)  # alembic/env.py resolves things relative to CWD
    command.stamp(alembic_cfg, "head")

    print("==> Seeding the Card Catalog (data-only migration, replayed directly)")
    spec = importlib.util.spec_from_file_location("seed_card_catalog", SEED_MIGRATION_FILE)
    seed = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed)
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        seed.op = Operations(ctx)
        with conn.begin():
            seed.upgrade()

    print("Schema bootstrap complete.")


if __name__ == "__main__":
    main()
