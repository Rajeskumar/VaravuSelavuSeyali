#!/bin/bash
set -e

# Run this script to spin up a temporary PostgreSQL container, run migrations, and execute the E2E tests against it.

CONTAINER_NAME="vs-pg-test-container-$(date +%s)"
DB_USER="vs_test"
DB_PASS="vs_test_pass"
DB_NAME="tracking_db"
DB_PORT=5433  # use alternate port to avoid conflict with potential local pg

echo "Starting PostgreSQL container ($CONTAINER_NAME)..."
docker run --name "$CONTAINER_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -e POSTGRES_DB="$DB_NAME" \
  -p $DB_PORT:5432 \
  -d postgres:15-alpine

function cleanup {
  echo "Cleaning up container ($CONTAINER_NAME)..."
  docker stop "$CONTAINER_NAME" > /dev/null
  docker rm "$CONTAINER_NAME" > /dev/null
}
trap cleanup EXIT

echo "Waiting for PostgreSQL to be ready..."
# Wait up to 15 seconds for db to start via host port mapping
for i in {1..15}; do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" > /dev/null 2>&1; then
    echo "pg_isready confirmed inside container. Waiting 3s for port mapping to stabilize..."
    sleep 3
    break
  fi
  sleep 1
done

echo "Setting up schema..."
# Create schema
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "CREATE SCHEMA IF NOT EXISTS trackspense;" > /dev/null

# Apply models translation for initial tables
# Run from varavu_selavu_app directory with PYTHONPATH=.
echo "Applying full item/merchant insights migration..."

PYTHONPATH=. poetry run python -c "
from sqlalchemy import create_engine
from varavu_selavu_service.db.session import Base
from varavu_selavu_service.db.models import User, Expense, ExpenseItem, RecurringTemplate, ItemInsight, ItemPriceHistory, MerchantInsight, MerchantAggregate
# Create connection to the dockerized PG
eng = create_engine('postgresql://$DB_USER:$DB_PASS@localhost:$DB_PORT/$DB_NAME', execution_options={'schema_translate_map': {'trackspense': 'trackspense'}})
Base.metadata.create_all(bind=eng)
# Note: Since the models for ItemInsight etc. are already in models.py, create_all handles them!
print('All PostgreSQL tables created successfully via SQLAlchemy metadata.')
"

# Run tests
echo "Running E2E tests against PostgreSQL..."
export E2E_DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:$DB_PORT/$DB_NAME"
export PYTHONPATH=.
poetry run pytest tests/test_analytics_e2e_pg.py -v

echo "E2E Testing completed successfully!"
