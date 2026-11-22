"""Startup check: is the connected database at the migration the code expects?

A database that lags the code does not fail at boot; it fails later, on the first request that
touches a new column or table (a 2026-11 dev database missed two migrations and every login
returned 500 with "column refresh_tokens.authenticated_at does not exist"). Saying so up front,
with the fix, turns that into a one-line message in the log. It never blocks startup and never
changes the database.
"""

import logging
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy import text
from sqlalchemy.engine import Engine

log = logging.getLogger("varavu_selavu.migrations")
_ALEMBIC_DIR = Path(__file__).resolve().parents[2] / "alembic"


def code_head() -> Optional[str]:
    """The newest migration shipped with this code, or None when the alembic folder is absent."""
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        cfg = Config()
        cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
        return ScriptDirectory.from_config(cfg).get_current_head()
    except Exception:  # not shipped in this image, or unreadable: nothing to compare against
        return None


def database_revision(engine: Engine) -> Optional[str]:
    """The revision the database says it is at, or None when it has no alembic bookkeeping
    (SQLite test databases and freshly bootstrapped schemas)."""
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT version_num FROM trackspense.alembic_version")).first()
        return row[0] if row else None
    except Exception:
        return None


def behind(current: Optional[str], head: Optional[str]) -> bool:
    return bool(current and head and current != head)


def check(engine: Engine) -> Tuple[Optional[str], Optional[str]]:
    current, head = database_revision(engine), code_head()
    if behind(current, head):
        log.error(
            "DATABASE IS BEHIND THE CODE: it is at migration %s but this code expects %s. Requests that "
            "use newer columns or tables will fail (for example login with a 500). Fix: from "
            "varavu_selavu_app run `poetry run alembic upgrade head` against this database.",
            current,
            head,
        )
    return current, head
