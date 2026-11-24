#!/usr/bin/env bash
# Rehearse new Alembic revisions on the previous release's schema, then prove they downgrade and
# re-apply. Used by .github/workflows/migrations.yml and runnable locally:
#
#   SDLC_TEST_ENV=local E2E_DATABASE_URL=postgresql://user@localhost:5432/throwaway \
#     scripts/quality/migration-rehearsal.sh [base-ref]     # default: latest release-v* tag
#
# The database must be a disposable localhost database: it is reset (schema dropped) first.
# DATABASE_URL is forced to E2E_DATABASE_URL so a production URL in .env is never used.
# Steps: previous release models -> create_all -> stamp previous head -> upgrade head ->
# downgrade to previous head -> upgrade head again.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
python3 scripts/quality/check-local-test-env.py
APP=varavu_selavu_app
BASE="${1:-$(git describe --tags --abbrev=0 --match 'release-v*' 2>/dev/null || true)}"
[[ -n "$BASE" ]] || { echo "migration-rehearsal: no release tag to rehearse from"; exit 2; }

changed_revisions="$(git diff --name-only --diff-filter=MDR "$BASE" -- "$APP/alembic/versions" | grep '\.py$' || true)"
if [[ -n "$changed_revisions" ]]; then
  echo "migration-rehearsal: FAIL — existing revision(s) modified/deleted since $BASE (add a new revision instead):" >&2
  echo "$changed_revisions" >&2
  exit 1
fi
new_revisions="$(git diff --name-only --diff-filter=A "$BASE" -- "$APP/alembic/versions" | grep '\.py$' || true)"
if [[ -z "$new_revisions" ]]; then
  echo "migration-rehearsal: no new Alembic revisions since $BASE — nothing to rehearse"
  exit 0
fi
echo "migration-rehearsal: $(wc -l <<<"$new_revisions" | tr -d ' ') new revision(s) since $BASE"

export DATABASE_URL="$E2E_DATABASE_URL" PYTHONPATH=.
# Use the current venv's binaries directly: `poetry -C` would also change the working directory,
# silently running the "previous" steps against the current code.
VENV="$(cd "$ROOT/$APP" && poetry env info -p)"
PY="$VENV/bin/python"; ALEMBIC="$VENV/bin/alembic"
WORK="$(mktemp -d)"
cleanup() { git worktree remove --force "$WORK/prev" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
git worktree add --quiet --detach "$WORK/prev" "$BASE"

echo "== previous schema ($BASE): reset, create_all, stamp head"
(
  cd "$WORK/prev/$APP"
  "$PY" - <<'PY'
import os
from sqlalchemy import create_engine, text
from varavu_selavu_service.db.session import Base
from varavu_selavu_service.db import models  # noqa: F401  registers every table
engine = create_engine(os.environ["DATABASE_URL"])
with engine.begin() as conn:
    conn.execute(text("DROP SCHEMA IF EXISTS trackspense CASCADE"))
    conn.execute(text("CREATE SCHEMA trackspense"))
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
Base.metadata.create_all(bind=engine)
print("previous tables created")
PY
  "$ALEMBIC" stamp head >/dev/null
)
PREV_HEAD="$(cd "$WORK/prev/$APP" && "$ALEMBIC" heads 2>/dev/null | awk '{print $1}' | head -1)"
CURRENT_HEAD="$(cd "$ROOT/$APP" && "$ALEMBIC" heads 2>/dev/null | awk '{print $1}' | head -1)"
echo "previous head: $PREV_HEAD  current head: $CURRENT_HEAD"
[[ -n "$PREV_HEAD" && "$PREV_HEAD" != "$CURRENT_HEAD" ]] || { echo "migration-rehearsal: could not resolve distinct heads" >&2; exit 1; }

cd "$ROOT/$APP"
echo "== upgrade to current head"
"$ALEMBIC" upgrade head
echo "== downgrade to $PREV_HEAD (reversibility)"
"$ALEMBIC" downgrade "$PREV_HEAD"
echo "== re-apply current head (idempotent re-run)"
"$ALEMBIC" upgrade head
echo "migration-rehearsal: PASS ($BASE -> $("$ALEMBIC" heads 2>/dev/null | awk '{print $1}' | head -1))"
