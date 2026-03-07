import pytest
import os
import uuid
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from varavu_selavu_service.main import app
from varavu_selavu_service.db.session import Base, get_db
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import Expense, User, ExpenseItem, RecurringTemplate

# SQLite setup for testing with schema translation
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    execution_options={"schema_translate_map": {"trackspense": None}}
)
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

@pytest.fixture(scope="function")
def db_session():
    # Create the db structure per test to ensure clean state
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Seed a default user
    u = User(id=uuid.uuid4(), email="test@user.com", password_hash="hash", name="Test User")
    db.add(u)
    db.commit()
    
    yield db
    
    db.close()
    # Drop all after test
    Base.metadata.drop_all(bind=engine)
