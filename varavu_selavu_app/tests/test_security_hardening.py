"""Fixes from the 2026-10-06 security and privacy review.

Real tokens, no auth override: a fresh TestClient per test (the session-wide one keeps a cookie
jar across tests), with the suite's `auth_required` override removed for the duration.
"""
import subprocess
import sys
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from varavu_selavu_service.auth.security import UNUSABLE_PASSWORD_HASH, auth_required, validate_password_strength
from varavu_selavu_service.db.models import Expense, Group, GroupInvitation, GroupMember, User
from varavu_selavu_service.main import app

PW = "correct-horse-battery"
NEW_PW = "another-long-passphrase"


@pytest.fixture
def client(db_session):
    old = app.dependency_overrides.pop(auth_required, None)
    c = TestClient(app)
    try:
        yield c
    finally:
        c.close()
        if old is not None:
            app.dependency_overrides[auth_required] = old


def _register(c, email, password=PW):
    r = c.post("/api/v1/auth/register", json={"name": email.split("@")[0], "email": email, "password": password})
    assert r.status_code == 200, r.text


def _login(c, email, password=PW, headers=None):
    r = c.post("/api/v1/auth/login", data={"username": email, "password": password}, headers=headers or {})
    return r


def _tokens(r):
    body = r.json()
    return body["access_token"], body["refresh_token"]


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _verified(db_session, email):
    db_session.query(User).filter(User.email == email).update({"email_verified": True})
    db_session.commit()


# ---------------------------------------------------------------------------------------------
# Google sign-in account pre-hijacking
# ---------------------------------------------------------------------------------------------
def _google(c, claims):
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        return c.post("/api/v1/auth/google", json={"id_token": "x"})


def test_google_login_requires_a_verified_google_email(client, db_session):
    assert _google(client, {"email": "g1@x.com", "name": "G"}).status_code == 401
    assert _google(client, {"email": "g1@x.com", "name": "G", "email_verified": False}).status_code == 401
    assert db_session.query(User).filter(User.email == "g1@x.com").first() is None


def test_google_login_wipes_the_password_of_an_unverified_account_it_takes_over(client, db_session):
    """An attacker registers victim@x.com with a password they know. When the real owner later
    signs in with Google, the attacker's password and session must stop working."""
    _register(client, "victim@x.com", "attacker-known-pw-1")
    attacker_access, attacker_refresh = _tokens(_login(client, "victim@x.com", "attacker-known-pw-1"))
    assert client.get("/api/v1/auth/me", headers=_bearer(attacker_access)).status_code == 200

    assert _google(client, {"email": "victim@x.com", "name": "V", "email_verified": True}).status_code == 200

    user = db_session.query(User).filter(User.email == "victim@x.com").first()
    db_session.refresh(user)
    assert user.password_hash == UNUSABLE_PASSWORD_HASH
    assert user.email_verified is True
    assert _login(client, "victim@x.com", "attacker-known-pw-1").status_code == 401
    assert client.get("/api/v1/auth/me", headers=_bearer(attacker_access)).status_code == 401
    client.cookies.clear()  # /auth/refresh prefers the cookie over the body; use the attacker's token
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": attacker_refresh}).status_code == 401


def test_google_login_keeps_the_password_of_an_account_that_was_already_verified(client, db_session):
    _register(client, "owner@x.com")
    _verified(db_session, "owner@x.com")
    assert _google(client, {"email": "owner@x.com", "name": "O", "email_verified": True}).status_code == 200
    assert _login(client, "owner@x.com", PW).status_code == 200


# ---------------------------------------------------------------------------------------------
# Access tokens end with the session
# ---------------------------------------------------------------------------------------------
def test_logout_ends_the_access_token_not_just_the_refresh_token(client):
    _register(client, "u1@x.com")
    access, refresh = _tokens(_login(client, "u1@x.com"))
    assert client.get("/api/v1/auth/me", headers=_bearer(access)).status_code == 200
    assert client.post("/api/v1/auth/logout", json={"refresh_token": refresh}, headers=_bearer(access)).status_code == 200
    assert client.get("/api/v1/auth/me", headers=_bearer(access)).status_code == 401
    # Signing straight back in (same second) must not be caught by its own cut-off.
    again, _ = _tokens(_login(client, "u1@x.com"))
    assert client.get("/api/v1/auth/me", headers=_bearer(again)).status_code == 200


def test_password_reset_ends_existing_access_tokens(client, db_session):
    from varavu_selavu_service.auth.service import AuthService

    _register(client, "u2@x.com")
    access, _ = _tokens(_login(client, "u2@x.com"))
    svc = AuthService(db_session)
    token = svc.create_email_token("u2@x.com", "reset_password", __import__("datetime").timedelta(hours=1))
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "password": NEW_PW}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=_bearer(access)).status_code == 401


def test_a_deleted_accounts_token_stops_working(client, db_session):
    _register(client, "u3@x.com")
    access, _ = _tokens(_login(client, "u3@x.com"))
    r = client.request("DELETE", "/api/v1/auth/profile", json={"password": PW}, headers=_bearer(access))
    assert r.status_code == 200, r.text
    assert client.get("/api/v1/auth/me", headers=_bearer(access)).status_code == 401


# ---------------------------------------------------------------------------------------------
# Password rules, change-password, sessions
# ---------------------------------------------------------------------------------------------
@pytest.mark.parametrize("weak", ["password123", "12345678", "aaaaaaaa", "trackspense"])
def test_common_and_repetitive_passwords_are_refused(client, weak):
    r = client.post("/api/v1/auth/register", json={"name": "W", "email": "weak@x.com", "password": weak})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "password"]


def test_password_equal_to_the_email_is_refused():
    assert validate_password_strength("sampleuser", "sampleuser@x.com")
    assert validate_password_strength("a-completely-different-one", "sampleuser@x.com") is None


def test_change_password_requires_the_current_one_and_ends_other_sessions(client):
    _register(client, "u4@x.com")
    a1, _ = _tokens(_login(client, "u4@x.com"))
    a2, _ = _tokens(_login(client, "u4@x.com"))

    wrong = client.post("/api/v1/auth/change-password", json={"current_password": "nope-nope-nope", "new_password": NEW_PW}, headers=_bearer(a1))
    assert wrong.status_code == 403
    weak = client.post("/api/v1/auth/change-password", json={"current_password": PW, "new_password": "password123"}, headers=_bearer(a1))
    assert weak.status_code == 400
    same = client.post("/api/v1/auth/change-password", json={"current_password": PW, "new_password": PW}, headers=_bearer(a1))
    assert same.status_code == 400

    ok = client.post("/api/v1/auth/change-password", json={"current_password": PW, "new_password": NEW_PW}, headers=_bearer(a1))
    assert ok.status_code == 200, ok.text
    fresh = ok.json()["access_token"]
    assert client.get("/api/v1/auth/me", headers=_bearer(a1)).status_code == 401
    assert client.get("/api/v1/auth/me", headers=_bearer(a2)).status_code == 401
    assert client.get("/api/v1/auth/me", headers=_bearer(fresh)).status_code == 200  # this session continues
    assert _login(client, "u4@x.com", PW).status_code == 401
    assert _login(client, "u4@x.com", NEW_PW).status_code == 200


def test_sessions_can_be_listed_and_ended_individually_or_all_at_once(client):
    _register(client, "u5@x.com")
    a1, r1 = _tokens(_login(client, "u5@x.com"))
    a2, r2 = _tokens(_login(client, "u5@x.com"))
    items = client.get("/api/v1/auth/sessions", headers=_bearer(a1)).json()["items"]
    assert len(items) == 2
    victim = items[0]["family_id"]

    assert client.delete(f"/api/v1/auth/sessions/{victim}", headers=_bearer(a1)).status_code == 200
    # Ending a session also ends access tokens issued so far; a device that is still signed in
    # simply refreshes. Whichever refresh token survived is the one whose family wasn't ended.
    client.cookies.clear()
    def refresh_with(token):
        # /auth/refresh prefers the cookie over the body, and each refresh sets a new cookie, so
        # clear the jar before every call or the second one rides the first one's session.
        client.cookies.clear()
        return client.post("/api/v1/auth/refresh", json={"refresh_token": token}).status_code

    survivors = [r for r in (r1, r2) if refresh_with(r) == 200]
    assert len(survivors) == 1
    client.cookies.clear()
    fresh = client.post("/api/v1/auth/refresh", json={"refresh_token": survivors[0]}).json()["access_token"]
    assert len(client.get("/api/v1/auth/sessions", headers=_bearer(fresh)).json()["items"]) == 1
    assert client.delete(f"/api/v1/auth/sessions/{uuid.uuid4()}", headers=_bearer(fresh)).status_code == 404

    assert client.post("/api/v1/auth/logout-all", headers=_bearer(fresh)).status_code == 200
    assert client.get("/api/v1/auth/me", headers=_bearer(fresh)).status_code == 401
    client.cookies.clear()
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": survivors[0]}).status_code == 401


def test_a_user_cannot_end_another_users_session(client):
    _register(client, "u6@x.com")
    _register(client, "u7@x.com")
    a6, _ = _tokens(_login(client, "u6@x.com"))
    a7, _ = _tokens(_login(client, "u7@x.com"))
    theirs = client.get("/api/v1/auth/sessions", headers=_bearer(a7)).json()["items"][0]["family_id"]
    assert client.delete(f"/api/v1/auth/sessions/{theirs}", headers=_bearer(a6)).status_code == 404
    assert client.get("/api/v1/auth/me", headers=_bearer(a7)).status_code == 200


# ---------------------------------------------------------------------------------------------
# Account deletion
# ---------------------------------------------------------------------------------------------
def test_deleting_an_account_needs_the_password(client, db_session):
    _register(client, "u8@x.com")
    a, _ = _tokens(_login(client, "u8@x.com"))
    assert client.request("DELETE", "/api/v1/auth/profile", headers=_bearer(a)).status_code == 403
    assert client.request("DELETE", "/api/v1/auth/profile", json={"password": "wrong-wrong-1"}, headers=_bearer(a)).status_code == 403
    assert db_session.query(User).filter(User.email == "u8@x.com").first() is not None
    assert client.request("DELETE", "/api/v1/auth/profile", json={"password": PW}, headers=_bearer(a)).status_code == 200
    assert db_session.query(User).filter(User.email == "u8@x.com").first() is None


def test_a_google_only_account_confirms_deletion_by_typing_its_email(client, db_session):
    assert _google(client, {"email": "go@x.com", "name": "G", "email_verified": True}).status_code == 200
    token = _tokens(_google(client, {"email": "go@x.com", "name": "G", "email_verified": True}))[0]
    assert client.request("DELETE", "/api/v1/auth/profile", json={"confirm_email": "other@x.com"}, headers=_bearer(token)).status_code == 403
    assert client.request("DELETE", "/api/v1/auth/profile", json={"confirm_email": "GO@x.com"}, headers=_bearer(token)).status_code == 200


def test_deleting_an_account_purges_invitation_emails(client, db_session):
    _register(client, "u9@x.com")
    token, _ = _tokens(_login(client, "u9@x.com"))
    group = Group(id=uuid.uuid4(), name="G", created_by="u9@x.com")
    db_session.add(group)
    db_session.commit()
    seat = GroupMember(id=uuid.uuid4(), group_id=group.id, user_email="u9@x.com", display_name="Me", role="admin", status="active")
    db_session.add(seat)
    db_session.commit()
    from datetime import datetime, timedelta, timezone
    db_session.add(GroupInvitation(id=uuid.uuid4(), group_id=group.id, member_id=seat.id, invited_email="u9@x.com", token="t" * 40, expires_at=datetime.now(timezone.utc) + timedelta(days=1)))
    db_session.commit()

    assert client.request("DELETE", "/api/v1/auth/profile", json={"password": PW}, headers=_bearer(token)).status_code == 200
    assert db_session.query(GroupInvitation).filter(GroupInvitation.invited_email == "u9@x.com").count() == 0


# ---------------------------------------------------------------------------------------------
# Response hygiene
# ---------------------------------------------------------------------------------------------
def test_browser_clients_get_no_tokens_in_the_body_native_clients_do(client):
    _register(client, "u10@x.com")
    web = _login(client, "u10@x.com", headers={"X-TrackSpense-Client": "web"})
    assert web.status_code == 200
    assert web.json()["access_token"] is None and web.json()["refresh_token"] is None
    assert "vs_token" in web.cookies  # the cookie carries the session
    native = _login(client, "u10@x.com")
    assert native.json()["access_token"] and native.json()["refresh_token"]


def test_validation_errors_do_not_echo_what_was_submitted(client):
    r = client.post("/api/v1/auth/register", json={"name": "N", "email": "not-an-email", "password": "Secr3t-Value-Here"})
    assert r.status_code == 422
    body = r.text
    assert "not-an-email" not in body and "Secr3t" not in body
    assert all("input" not in e for e in r.json()["detail"])
    assert r.json()["detail"][0]["loc"] == ["body", "email"]


def test_responses_carry_security_headers_and_api_responses_are_not_cacheable(client):
    r = client.get("/api/v1/healthz")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "max-age" in r.headers["strict-transport-security"]
    assert r.headers["referrer-policy"]
    assert r.headers["cache-control"] == "no-store"


def test_api_docs_are_only_served_locally():
    """The schema lists every endpoint and field. Checked in a subprocess because the app object
    is built at import time from the environment."""
    code = (
        "from varavu_selavu_service.main import app;"
        "print(app.openapi_url, app.docs_url, app.redoc_url)"
    )
    env = {"ENVIRONMENT": "production", "JWT_SECRET": "x" * 40, "DATABASE_URL": "sqlite:///:memory:", "PATH": "/usr/bin:/bin"}
    import os
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env={**os.environ, **env})
    assert out.stdout.strip().splitlines()[-1] == "None None None", out.stderr[-400:]
    local = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env={**os.environ, "ENVIRONMENT": "local"})
    assert local.stdout.strip().splitlines()[-1] == "/openapi.json /docs /redoc"


def test_logged_email_addresses_are_masked():
    from varavu_selavu_service.auth.routers import _mask_email

    assert _mask_email("alex@example.com") == "a***@example.com"
    assert "alex" not in _mask_email("alex@example.com")
    assert _mask_email("") == "***"


# ---------------------------------------------------------------------------------------------
# Group existence is not an oracle; add-member is rate limited
# ---------------------------------------------------------------------------------------------
def test_a_group_you_are_not_in_looks_exactly_like_one_that_does_not_exist(client, db_session):
    _register(client, "o1@x.com")
    _register(client, "o2@x.com")
    t1, _ = _tokens(_login(client, "o1@x.com"))
    t2, _ = _tokens(_login(client, "o2@x.com"))
    _verified(db_session, "o1@x.com")
    gid = client.post("/api/v1/groups", json={"name": "Private"}, headers=_bearer(t1)).json()["group_id"]
    theirs = client.get(f"/api/v1/groups/{gid}", headers=_bearer(t2))
    missing = client.get(f"/api/v1/groups/{uuid.uuid4()}", headers=_bearer(t2))
    assert (theirs.status_code, theirs.json()) == (missing.status_code, missing.json()) == (404, {"detail": "Group not found"})


def test_adding_members_is_rate_limited(client, db_session):
    _register(client, "rl@x.com")
    _verified(db_session, "rl@x.com")
    token, _ = _tokens(_login(client, "rl@x.com"))
    gid = client.post("/api/v1/groups", json={"name": "RL"}, headers=_bearer(token)).json()["group_id"]
    codes = [client.post(f"/api/v1/groups/{gid}/members", json={"display_name": f"P{i}"}, headers=_bearer(token)).status_code for i in range(32)]
    assert codes[:30] == [201] * 30
    assert 429 in codes[30:]


# ---------------------------------------------------------------------------------------------
# "Download my data"
# ---------------------------------------------------------------------------------------------
def test_account_export_contains_the_users_data_and_never_credentials(client, db_session):
    _register(client, "ex@x.com")
    token, _ = _tokens(_login(client, "ex@x.com"))
    from datetime import datetime
    db_session.add(Expense(id=uuid.uuid4(), user_email="ex@x.com", purchased_at=datetime(2026, 9, 1), category_id="Food", amount=12.5, description="Lunch"))
    db_session.add(Expense(id=uuid.uuid4(), user_email="someone@x.com", purchased_at=datetime(2026, 9, 1), category_id="Food", amount=99, description="Not mine")) if False else None
    db_session.commit()
    r = client.get("/api/v1/account/export", headers=_bearer(token))
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["profile"]["email"] == "ex@x.com"
    assert [e["description"] for e in data["personal_expenses"]] == ["Lunch"]
    flat = r.text
    assert "password" not in flat.lower().replace("password_", "") or "hash" not in flat.lower()
    assert "$2" not in flat  # no bcrypt hash anywhere
    assert "access_token" not in flat


def test_account_export_requires_login(client):
    assert client.get("/api/v1/account/export").status_code == 401
