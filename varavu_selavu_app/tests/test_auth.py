import os

from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch

from varavu_selavu_service.auth.routers import router, get_auth_service
from varavu_selavu_service.auth.service import AuthService
from varavu_selavu_service.auth.security import hash_password, verify_password


class FakeAuthService(AuthService):
    def __init__(self):
        self.users = {}
        self.revoked = set()

    def get_user(self, email: str):
        return self.users.get(email)

    def register_user(self, name: str, phone: str, email: str, password: str) -> bool:
        if email in self.users:
            return False
        hashed = hash_password(password)
        self.users[email] = {
            "name": name,
            "phone": phone,
            "email": email,
            "password_hash": hashed
        }
        return True

    def authenticate_user(self, email: str, password: str) -> bool:
        user = self.get_user(email)
        if not user:
            return False
        stored = user.get("password_hash")
        return verify_password(password, stored)

    def reset_password(self, email: str, password: str) -> bool:
        user = self.get_user(email)
        if not user:
            return False
        self.users[email]["password_hash"] = hash_password(password)
        return True

    def update_profile(self, email: str, name=None, phone=None) -> bool:
        user = self.get_user(email)
        if not user:
            return False
        if name:
            self.users[email]["name"] = name
        if phone:
            self.users[email]["phone"] = phone
        return True
        
    def revoke_refresh_token(self, token: str):
        self.revoked.add(token)

    def is_refresh_token_revoked(self, token: str) -> bool:
        return token in self.revoked


def create_app():
    app = FastAPI()
    fake_service = FakeAuthService()

    def override_auth_service():
        return fake_service

    app.dependency_overrides[get_auth_service] = override_auth_service
    app.include_router(router, prefix="/auth")
    return app, fake_service


def test_register_login_and_me():
    os.environ["JWT_SECRET"] = "test-secret"
    app, _ = create_app()
    client = TestClient(app)

    resp = client.post(
        "/auth/register",
        json={"name": "Alice", "phone": "123", "email": "a@b.com", "password": "pw"},
    )
    assert resp.status_code == 200

    login_resp = client.post(
        "/auth/login",
        data={"username": "a@b.com", "password": "pw"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "a@b.com"

    unauthorized = client.get("/auth/me")
    assert unauthorized.status_code == 401


def test_refresh_and_logout():
    os.environ["JWT_SECRET"] = "test-secret"
    app, _ = create_app()
    client = TestClient(app)

    client.post(
        "/auth/register",
        json={"name": "Bob", "phone": "999", "email": "x@y.com", "password": "pw"},
    )
    login_resp = client.post(
        "/auth/login",
        data={"username": "x@y.com", "password": "pw"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    tokens = login_resp.json()
    refresh_token = tokens["refresh_token"]

    refresh_resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 200

    client.post("/auth/logout", json={"refresh_token": refresh_token})
    invalid = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert invalid.status_code == 401


def test_google_login():
    os.environ["JWT_SECRET"] = "test-secret"
    os.environ["GOOGLE_CLIENT_ID"] = "cid"
    app, fake_service = create_app()
    client = TestClient(app)

    with patch("google.oauth2.id_token.verify_oauth2_token") as verify:
        verify.return_value = {"email": "g@x.com", "name": "G"}
        resp = client.post("/auth/google", json={"id_token": "t"})
    assert resp.status_code == 200
    assert "g@x.com" in fake_service.users
    data = resp.json()
    assert data["email"] == "g@x.com"
