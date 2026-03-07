import os
from unittest.mock import patch
from varavu_selavu_service.db.models import User
from varavu_selavu_service.main import app
from varavu_selavu_service.auth.security import auth_required

def test_register_login_and_me(test_client, db_session):
    old_override = app.dependency_overrides.get(auth_required)
    app.dependency_overrides.pop(auth_required, None)
    os.environ["JWT_SECRET"] = "test-secret"
    
    try:
        resp = test_client.post(
            "/api/v1/auth/register",
            json={"name": "Alice", "phone": "123", "email": "alice@test.com", "password": "pw"},
        )
        assert resp.status_code == 200

        login_resp = test_client.post(
            "/api/v1/auth/login",
            data={"username": "alice@test.com", "password": "pw"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert login_resp.status_code == 200
        tokens = login_resp.json()

        me = test_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
        assert me.status_code == 200
        assert me.json()["email"] == "alice@test.com"

        unauthorized = test_client.get("/api/v1/auth/me")
        assert unauthorized.status_code == 401
    finally:
        if old_override:
            app.dependency_overrides[auth_required] = old_override


def test_refresh_and_logout(test_client, db_session):
    old_override = app.dependency_overrides.get(auth_required)
    app.dependency_overrides.pop(auth_required, None)
    os.environ["JWT_SECRET"] = "test-secret"

    try:
        test_client.post(
            "/api/v1/auth/register",
            json={"name": "Bob", "phone": "999", "email": "bob@test.com", "password": "pw"},
        )
        login_resp = test_client.post(
            "/api/v1/auth/login",
            data={"username": "bob@test.com", "password": "pw"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        tokens = login_resp.json()
        refresh_token = tokens["refresh_token"]

        refresh_resp = test_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert refresh_resp.status_code == 200

        test_client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
        invalid = test_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert invalid.status_code == 401
    finally:
        if old_override:
            app.dependency_overrides[auth_required] = old_override


def test_google_login(test_client, db_session):
    old_override = app.dependency_overrides.get(auth_required)
    app.dependency_overrides.pop(auth_required, None)
    os.environ["JWT_SECRET"] = "test-secret"
    os.environ["GOOGLE_CLIENT_ID"] = "cid"

    try:
        with patch("google.oauth2.id_token.verify_oauth2_token") as verify:
            verify.return_value = {"email": "g@x.com", "name": "Google User"}
            resp = test_client.post("/api/v1/auth/google", json={"id_token": "dummy_token"})
        
        assert resp.status_code == 200
        
        # Assert was saved
        u = db_session.query(User).filter(User.email == "g@x.com").first()
        assert u is not None
        
        data = resp.json()
        assert data["email"] == "g@x.com"
    finally:
        if old_override:
            app.dependency_overrides[auth_required] = old_override
