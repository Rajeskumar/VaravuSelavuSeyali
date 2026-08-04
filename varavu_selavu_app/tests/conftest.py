import pytest
import os
import uuid
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
# TestClient talks plain http to "testserver", and a Secure cookie would not be
# sent back over it. Cookie attributes themselves are asserted explicitly in
# tests/test_auth_cookies.py.
os.environ["AUTH_COOKIE_SECURE"] = "false"

from varavu_selavu_service.main import app
from varavu_selavu_service.db.session import Base, get_db
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import Expense, User, ExpenseItem, RecurringTemplate

from sqlalchemy import event

# SQLite setup for testing with schema translation
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    execution_options={"schema_translate_map": {"trackspense": None}}
)

# Scoped to this engine only (not the global Engine class) so other test
# files that create their own standalone SQLite engines aren't affected.
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

def override_auth():
    return "test@user.com"

app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[auth_required] = override_auth

@pytest.fixture(scope="session")
def test_app():
    return app

@pytest.fixture(scope="session")
def test_client(test_app):
    return TestClient(test_app)

@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Rate-limit counters are process-global; without this, tests that log in or
    register repeatedly exhaust the limit and start seeing 429s."""
    from varavu_selavu_service.core.limiter import limiter

    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(autouse=True)
def _clear_analysis_cache():
    """AnalysisService._CACHE is class-level, so it outlives the per-test database
    and would otherwise serve one test's totals to the next."""
    from varavu_selavu_service.services.analysis_service import AnalysisService

    AnalysisService._CACHE.clear()
    yield
    AnalysisService._CACHE.clear()


@pytest.fixture(scope="function")
def db_session():
    # Create the db structure per test to ensure clean state
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Seed a default user
    u = User(id=uuid.uuid4(), email="test@user.com", password_hash="hash", name="Test User")
    db.add(u)
    db.commit()
    
    try:
        yield db
    finally:
        db.close()
        # Drop all after test
        Base.metadata.drop_all(bind=engine)
