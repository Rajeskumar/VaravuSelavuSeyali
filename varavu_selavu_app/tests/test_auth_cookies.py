"""Cookie-based auth, CSRF and refresh rotation (P0-1).

These tests deliberately drop the global `auth_required` override from conftest
so the real cookie/header resolution runs.
"""

import uuid

import pytest

from varavu_selavu_service.auth.cookies import ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE
from varavu_selavu_service.auth.security import auth_required, create_access_token
from varavu_selavu_service.db.models import User
from varavu_selavu_service.main import app

PASSWORD = "correct-horse-battery"
EMAIL = "cookie@test.com"


@pytest.fixture
def real_auth(test_client):
    """Removes the conftest auth override for the duration of a test.

    Also empties the shared (session-scoped) cookie jar, so a session left behind
    by an earlier test cannot satisfy auth in this one.
    """
    saved = app.dependency_overrides.pop(auth_required, None)
    test_client.cookies.clear()
    try:
        yield
    finally:
        test_client.cookies.clear()
        if saved is not None:
            app.dependency_overrides[auth_required] = saved


@pytest.fixture
def registered(test_client, db_session, real_auth):
    res = test_client.post(
        "/api/v1/auth/register",
        json={"name": "Cookie", "phone": "555", "email": EMAIL, "password": PASSWORD},
    )
    assert res.status_code == 200, res.text
    return EMAIL


def _login(test_client):
    return test_client.post(
        "/api/v1/auth/login",
        data={"username": EMAIL, "password": PASSWORD},
    )


class TestLoginSetsCookies:
    def test_tokens_are_httponly_and_csrf_cookie_is_not(self, test_client, registered):
        res = _login(test_client)
        assert res.status_code == 200, res.text

        jar = {c.name for c in res.cookies.jar}
        assert ACCESS_COOKIE in jar
        assert REFRESH_COOKIE in jar
        assert CSRF_COOKIE in jar

        raw = res.headers.get_list("set-cookie")
        access_header = next(h for h in raw if h.startswith(f"{ACCESS_COOKIE}="))
        refresh_header = next(h for h in raw if h.startswith(f"{REFRESH_COOKIE}="))
        csrf_header = next(h for h in raw if h.startswith(f"{CSRF_COOKIE}="))

        assert "HttpOnly" in access_header
        assert "HttpOnly" in refresh_header
        # The client must be able to read this one to echo it back.
        assert "HttpOnly" not in csrf_header

        for header in (access_header, refresh_header, csrf_header):
            assert "samesite=strict" in header.lower()

    def test_cookies_are_marked_secure_when_configured(self, test_client, registered, monkeypatch):
        """Secure is disabled in the test env so the http TestClient can round-trip
        cookies; this asserts the production setting actually reaches the header."""
        from varavu_selavu_service.auth import cookies as cookies_module

        monkeypatch.setattr(cookies_module.settings, "AUTH_COOKIE_SECURE", True)
        res = _login(test_client)

        for name in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE):
            header = next(h for h in res.headers.get_list("set-cookie") if h.startswith(f"{name}="))
            assert "secure" in header.lower(), header

    def test_refresh_cookie_is_scoped_to_the_auth_path(self, test_client, registered):
        res = _login(test_client)
        refresh_header = next(h for h in res.headers.get_list("set-cookie") if h.startswith(f"{REFRESH_COOKIE}="))
        assert "Path=/api/v1/auth" in refresh_header

    def test_authenticated_request_works_from_cookies_alone(self, test_client, registered):
        _login(test_client)
        # No Authorization header — the cookie jar carries the session.
        res = test_client.get("/api/v1/auth/me")
        assert res.status_code == 200, res.text
        assert res.json()["email"] == EMAIL


class TestBearerFallback:
    """Native clients have no cookie jar and must keep working."""

    def test_authorization_header_still_authenticates(self, test_client, db_session, real_auth):
        db_session.add(User(id=uuid.uuid4(), email="native@test.com", password_hash="h", name="N"))
        db_session.commit()
        token = create_access_token({"sub": "native@test.com"})

        res = test_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200, res.text
        assert res.json()["email"] == "native@test.com"

    def test_login_still_returns_tokens_in_the_body(self, test_client, registered):
        body = _login(test_client).json()
        assert body["access_token"]
        assert body["refresh_token"]
        assert body["token_type"] == "bearer"


class TestCSRF:
    def test_mutating_cookie_request_without_csrf_header_is_rejected(self, test_client, registered):
        _login(test_client)
        res = test_client.put("/api/v1/auth/profile", json={"name": "New Name"})
        assert res.status_code == 403
        assert "CSRF" in res.json()["detail"]

    def test_mutating_cookie_request_with_csrf_header_succeeds(self, test_client, registered):
        login_res = _login(test_client)
        csrf = login_res.json()["csrf_token"]

        res = test_client.put(
            "/api/v1/auth/profile",
            json={"name": "New Name"},
            headers={CSRF_HEADER: csrf},
        )
        assert res.status_code == 200, res.text
        assert res.json()["name"] == "New Name"

    def test_mismatched_csrf_token_is_rejected(self, test_client, registered):
        _login(test_client)
        res = test_client.put(
            "/api/v1/auth/profile",
            json={"name": "New Name"},
            headers={CSRF_HEADER: "not-the-right-token"},
        )
        assert res.status_code == 403

    def test_safe_methods_do_not_require_csrf(self, test_client, registered):
        _login(test_client)
        assert test_client.get("/api/v1/auth/me").status_code == 200

    def test_bearer_clients_are_exempt_from_csrf(self, test_client, db_session, real_auth):
        """No ambient credential, so no CSRF exposure — and mobile sends no header."""
        db_session.add(User(id=uuid.uuid4(), email="native2@test.com", password_hash="h", name="N"))
        db_session.commit()
        token = create_access_token({"sub": "native2@test.com"})

        res = test_client.put(
            "/api/v1/auth/profile",
            json={"name": "Native Name"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text


class TestRefreshRotation:
    def test_refresh_from_cookie_issues_a_new_pair(self, test_client, registered):
        _login(test_client)
        res = test_client.post("/api/v1/auth/refresh")
        assert res.status_code == 200, res.text
        assert res.json()["email"] == EMAIL
        assert ACCESS_COOKIE in {c.name for c in res.cookies.jar}

    def test_rotation_replaces_the_refresh_cookie(self, test_client, registered):
        first_refresh = _login(test_client).json()["refresh_token"]
        rotated = test_client.post("/api/v1/auth/refresh")
        assert rotated.status_code == 200
        assert rotated.json()["refresh_token"] != first_refresh

    def test_reusing_a_spent_refresh_token_is_rejected(self, test_client, registered):
        """Native-client flow: the token travels in the body, with no cookie jar
        to supply a fresher one."""
        original = _login(test_client).json()["refresh_token"]
        test_client.cookies.clear()

        first = test_client.post("/api/v1/auth/refresh", json={"refresh_token": original})
        assert first.status_code == 200, first.text
        test_client.cookies.clear()

        replayed = test_client.post("/api/v1/auth/refresh", json={"refresh_token": original})
        assert replayed.status_code == 401

    def test_refresh_without_any_token_is_rejected(self, test_client, db_session, real_auth):
        res = test_client.post("/api/v1/auth/refresh")
        assert res.status_code == 401

    def test_logout_revokes_the_refresh_token_and_clears_cookies(self, test_client, registered):
        login_body = _login(test_client).json()
        refresh_token = login_body["refresh_token"]

        res = test_client.post("/api/v1/auth/logout", headers={CSRF_HEADER: login_body["csrf_token"]})
        assert res.status_code == 200, res.text

        # The Set-Cookie directives expire the session cookies.
        cleared = " ".join(res.headers.get_list("set-cookie"))
        assert ACCESS_COOKIE in cleared
        assert REFRESH_COOKIE in cleared

        test_client.cookies.clear()
        replay = test_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert replay.status_code == 401


class TestLegacySessionExchange:
    def test_localstorage_refresh_token_exchanges_for_cookies(self, test_client, registered):
        legacy_refresh = _login(test_client).json()["refresh_token"]
        test_client.cookies.clear()

        res = test_client.post("/api/v1/auth/session", json={"refresh_token": legacy_refresh})
        assert res.status_code == 200, res.text
        assert ACCESS_COOKIE in {c.name for c in res.cookies.jar}

    def test_exchange_is_single_use(self, test_client, registered):
        legacy_refresh = _login(test_client).json()["refresh_token"]
        test_client.cookies.clear()

        assert test_client.post("/api/v1/auth/session", json={"refresh_token": legacy_refresh}).status_code == 200
        assert test_client.post("/api/v1/auth/session", json={"refresh_token": legacy_refresh}).status_code == 401


class TestNoUserEnumeration:
    def test_registering_an_existing_email_gives_a_generic_error(self, test_client, registered):
        res = test_client.post(
            "/api/v1/auth/register",
            json={"name": "Other", "phone": "555", "email": EMAIL, "password": "another-pass"},
        )
        assert res.status_code == 400
        assert "already exists" not in res.text.lower()

    def test_forgot_password_does_not_reveal_whether_the_user_exists(self, test_client, db_session, real_auth):
        res = test_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody@test.com", "password": "whatever-pass"},
        )
        assert res.status_code == 200
        assert res.json()["success"] is True
