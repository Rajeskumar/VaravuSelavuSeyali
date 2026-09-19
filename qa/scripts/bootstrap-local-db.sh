#!/bin/bash
# Stands up a disposable local Postgres for the QA framework to run the backend against.
#
# NOTE: this does NOT run `alembic upgrade head` — that command does not work against a
# truly empty database in this repo (the root migration assumes db/schema.sql was applied
# by hand first, and several later tables were never given migrations at all, only ORM
# model definitions — the same gap run_e2e_pg_tests.sh works around with
# Base.metadata.create_all()). See scripts/bootstrap_schema.py's docstring for the full
# explanation and qa/TEST-PLAN.md's risk areas for why this also affects the real
# cloudbuild.yaml deploy pipeline, not just QA tooling.
#
# Usage: npm run qa:db:bootstrap   (from qa/), or bash scripts/bootstrap-local-db.sh directly.
# Leaves the container running (unlike run_e2e_pg_tests.sh) — this is meant to back a local
# dev loop across many test runs, not a single throwaway CI job. Re-run any time to reset:
# it recreates the container from scratch.
set -euo pipefail

CONTAINER_NAME="trackspense-qa-postgres"
DB_USER="${QA_DB_USER:-trackspense_qa}"
DB_PASS="${QA_DB_PASS:-trackspense_qa_pass}"
DB_NAME="${QA_DB_NAME:-trackspense_qa}"
DB_PORT="${QA_DB_PORT:-5434}" # distinct from the app's own dev Postgres and run_e2e_pg_tests.sh's 5433

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/varavu_selavu_app"

echo "==> Resetting Postgres container ($CONTAINER_NAME) on port $DB_PORT"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run --name "$CONTAINER_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -e POSTGRES_DB="$DB_NAME" \
  -p "$DB_PORT":5432 \
  -d postgres:15-alpine >/dev/null

echo "==> Waiting for Postgres to accept connections"
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
    sleep 2
    break
  fi
  sleep 1
done

echo "==> Creating schema + pg_trgm extension"
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "CREATE SCHEMA IF NOT EXISTS trackspense;" >/dev/null
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:$DB_PORT/$DB_NAME"

echo "==> Bootstrapping schema + seed data"
(
  cd "$BACKEND_DIR"
  DATABASE_URL="$DATABASE_URL" PYTHONPATH=. poetry run python "$REPO_ROOT/qa/scripts/bootstrap_schema.py"
)

cat <<EOF

Local QA Postgres is up.

  DATABASE_URL=$DATABASE_URL

Start the backend against it, e.g.:
  cd $BACKEND_DIR
  DATABASE_URL=$DATABASE_URL ENVIRONMENT=local JWT_SECRET=qa-local-secret AUTH_COOKIE_SECURE=false \\
    MAIL_USERNAME= MAIL_PASSWORD= \\
    OCR_ENGINE=mock GROUPS_ENABLED=true BUDGETS_ENABLED=true CARD_COACH_ENABLED=true TAGS_ENABLED=true \\
    poetry run uvicorn varavu_selavu_service.main:app --host 0.0.0.0 --port 8000 --reload

  # AUTH_COOKIE_SECURE=false is not optional here: the default (true) marks the auth
  # cookies `Secure`, which browsers refuse to send over plain http://localhost — every
  # login would silently "succeed" and then every following request would look logged out.
  #
  # MAIL_USERNAME=/MAIL_PASSWORD= (blank) are not optional either — left off this line,
  # Settings() falls back to whatever real Gmail credentials are already in this backend's
  # own .env, and group tests seat the already-registered QA_USERS.secondary persona by
  # real email several times per run (groups-api.spec.ts, balances.spec.ts,
  # group-splits.spec.ts). Every one of those then sends a real "you were added to a
  # group" email. Reproduced: this is what "ran the QA suite and got mail failures" was.
  # Blank, email_service.py no-ops and just logs the message instead of sending it — same
  # as CI already does (.github/workflows/qa.yml).

Then the frontend:
  cd $REPO_ROOT/varavu_selavu_ui
  REACT_APP_API_BASE_URL=http://localhost:8080 npm start

In qa/.env, set QA_DATABASE_URL to the same value as DATABASE_URL above — global.setup.ts
uses it to mark the QA personas email-verified (group actions require it; there's no real
SMTP in QA to click a verification link with). Without it, group tests fail with a clear
403 instead of this step failing.
  QA_DATABASE_URL=$DATABASE_URL

See qa/README.md for the full local-run walkthrough.
EOF
