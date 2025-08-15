import os
from fastapi import FastAPI
from fastapi.testclient import TestClient

from varavu_selavu_service.auth.routers import router, get_auth_service
from varavu_selavu_service.auth.service import AuthService


class FakeSheet:
    def __init__(self):
        self.rows = []

    def get_all_records(self):
        return self.rows

    def append_row(self, row):
        self.rows.append({"name": row[0], "phone": row[1], "email": row[2], "password": row[3]})


def create_app():
    app = FastAPI()
    sheet = FakeSheet()

    def override_auth_service():
        return AuthService(user_ws=sheet)

    app.dependency_overrides[get_auth_service] = override_auth_service
    app.include_router(router, prefix="/auth")
    return app, sheet


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
