"""Email verification + password reset (fixes the pre-existing account-takeover bug where
POST /auth/forgot-password accepted {email, password} and reset the password immediately
with no proof of email ownership, protected only by a 5/hour rate limit).
"""

import os
from datetime import timedelta
from unittest.mock import patch

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import EmailToken
from varavu_selavu_service.main import app


def _drop_auth_override():
    old_override = app.dependency_overrides.get(auth_required)
    app.dependency_overrides.pop(auth_required, None)
    os.environ["JWT_SECRET"] = "test-secret"
    return old_override


def _restore_auth_override(old_override):
    if old_override:
        app.dependency_overrides[auth_required] = old_override


def _register_and_login(test_client, email: str, password: str = "pw"):
    test_client.post(
        "/api/v1/auth/register",
        json={"name": "User", "email": email, "password": password},
    )
    login_resp = test_client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return login_resp.json()


def _backdate_token(db_session, purpose: str, by: timedelta) -> None:
    row = (
        db_session.query(EmailToken)
        .filter(EmailToken.purpose == purpose)
        .order_by(EmailToken.created_at.desc())
        .first()
    )
    assert row is not None
    row.expires_at = row.expires_at - by
    db_session.commit()


class TestEmailVerification:
    def test_register_starts_unverified_and_me_reflects_it(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            with patch("varavu_selavu_service.auth.routers._send_verification_email"):
                tokens = _register_and_login(test_client, "unverified@test.com")
            me = test_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
            assert me.json()["email_verified"] is False
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_verify_email_with_valid_token_marks_verified(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            captured = {}
            with patch("varavu_selavu_service.auth.routers._send_verification_email", side_effect=lambda email, token: captured.update(token=token)):
                tokens = _register_and_login(test_client, "toverify@test.com")

            resp = test_client.post("/api/v1/auth/verify-email", json={"token": captured["token"]})
            assert resp.status_code == 200

            me = test_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
            assert me.json()["email_verified"] is True
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_verify_email_token_is_single_use(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            captured = {}
            with patch("varavu_selavu_service.auth.routers._send_verification_email", side_effect=lambda email, token: captured.update(token=token)):
                _register_and_login(test_client, "singleuse@test.com")

            first = test_client.post("/api/v1/auth/verify-email", json={"token": captured["token"]})
            assert first.status_code == 200
            second = test_client.post("/api/v1/auth/verify-email", json={"token": captured["token"]})
            assert second.status_code == 400
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_verify_email_rejects_expired_token(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            captured = {}
            with patch("varavu_selavu_service.auth.routers._send_verification_email", side_effect=lambda email, token: captured.update(token=token)):
                _register_and_login(test_client, "expired@test.com")

            _backdate_token(db_session, "verify_email", by=timedelta(days=4))
            resp = test_client.post("/api/v1/auth/verify-email", json={"token": captured["token"]})
            assert resp.status_code == 400
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_verify_email_rejects_garbage_token(self, test_client, db_session):
        resp = test_client.post("/api/v1/auth/verify-email", json={"token": "not-a-real-token"})
        assert resp.status_code == 400

    def test_a_reset_password_token_cannot_verify_email(self, test_client, db_session):
        """Purpose isolation: a token minted for one flow must not work for the other."""
        old = _drop_auth_override()
        try:
            reset_captured = {}
            with patch("varavu_selavu_service.auth.routers._send_verification_email"), \
                 patch("varavu_selavu_service.auth.routers._send_password_reset_email", side_effect=lambda email, token: reset_captured.update(token=token)):
                _register_and_login(test_client, "crosspurpose@test.com")
                test_client.post("/api/v1/auth/forgot-password", json={"email": "crosspurpose@test.com"})

            resp = test_client.post("/api/v1/auth/verify-email", json={"token": reset_captured["token"]})
            assert resp.status_code == 400
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_google_login_with_verified_claim_marks_verified_immediately(self, test_client, db_session):
        old = _drop_auth_override()
        os.environ["GOOGLE_CLIENT_ID"] = "cid"
        try:
            with patch("google.oauth2.id_token.verify_oauth2_token") as verify:
                verify.return_value = {"email": "gverified@x.com", "name": "G User", "email_verified": True}
                resp = test_client.post("/api/v1/auth/google", json={"id_token": "dummy"})
            assert resp.status_code == 200

            me = test_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {resp.json()['access_token']}"})
            assert me.json()["email_verified"] is True
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_resend_verification_requires_auth(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            resp = test_client.post("/api/v1/auth/resend-verification")
            assert resp.status_code == 401
        finally:
            _restore_auth_override(old)

    def test_resend_verification_no_ops_when_already_verified(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            captured = {}
            with patch("varavu_selavu_service.auth.routers._send_verification_email", side_effect=lambda email, token: captured.update(token=token)):
                tokens = _register_and_login(test_client, "alreadyok@test.com")
            test_client.post("/api/v1/auth/verify-email", json={"token": captured["token"]})

            # login() also sets a cookie session alongside the returned Bearer token; clear it
            # so this exercises the native-client (Bearer-only, CSRF-exempt) path, matching how
            # a mobile client would actually call this route.
            test_client.cookies.clear()
            resp = test_client.post(
                "/api/v1/auth/resend-verification",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            assert resp.status_code == 200
            assert resp.json()["already_verified"] is True
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)


class TestPasswordResetVulnerabilityFix:
    """POST /auth/forgot-password used to accept {email, password} and reset the password
    unconditionally — no token, no proof of email ownership. These tests lock in the fix:
    a bare email can no longer change anyone's password without redeeming a real token."""

    def test_forgot_password_no_longer_accepts_a_password_field(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            with patch("varavu_selavu_service.auth.routers._send_verification_email"):
                _register_and_login(test_client, "victim@test.com", password="original-pw")

            with patch("varavu_selavu_service.auth.routers._send_password_reset_email"):
                # Old exploit payload — email + attacker-chosen new password, no token.
                resp = test_client.post(
                    "/api/v1/auth/forgot-password",
                    json={"email": "victim@test.com", "password": "attacker-chosen-pw"},
                )
            assert resp.status_code == 200  # still reports success (anti-enumeration)

            # The password must be UNCHANGED — the original still logs in.
            still_original = test_client.post(
                "/api/v1/auth/login",
                data={"username": "victim@test.com", "password": "original-pw"},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            assert still_original.status_code == 200

            attacker_pw_rejected = test_client.post(
                "/api/v1/auth/login",
                data={"username": "victim@test.com", "password": "attacker-chosen-pw"},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            assert attacker_pw_rejected.status_code == 401
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_forgot_password_is_silent_for_unknown_email(self, test_client, db_session):
        """Anti-enumeration: unknown address still reports success, and no email is sent."""
        with patch("varavu_selavu_service.auth.routers._send_password_reset_email") as send:
            resp = test_client.post("/api/v1/auth/forgot-password", json={"email": "nobody@test.com"})
        assert resp.status_code == 200
        send.assert_not_called()

    def test_full_reset_flow_changes_password_and_revokes_sessions(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            with patch("varavu_selavu_service.auth.routers._send_verification_email"):
                tokens = _register_and_login(test_client, "resetme@test.com", password="old-pw")
            refresh_token = tokens["refresh_token"]

            captured = {}
            with patch("varavu_selavu_service.auth.routers._send_password_reset_email", side_effect=lambda email, token: captured.update(token=token)):
                fp = test_client.post("/api/v1/auth/forgot-password", json={"email": "resetme@test.com"})
            assert fp.status_code == 200
            assert "token" in captured

            reset = test_client.post(
                "/api/v1/auth/reset-password",
                json={"token": captured["token"], "password": "new-pw"},
            )
            assert reset.status_code == 200

            # Old password no longer works, new one does.
            old_pw = test_client.post(
                "/api/v1/auth/login",
                data={"username": "resetme@test.com", "password": "old-pw"},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            assert old_pw.status_code == 401
            new_pw = test_client.post(
                "/api/v1/auth/login",
                data={"username": "resetme@test.com", "password": "new-pw"},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            assert new_pw.status_code == 200

            # The pre-reset session is revoked (its refresh token no longer honors a refresh).
            test_client.cookies.clear()
            old_session = test_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
            assert old_session.status_code == 401
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_reset_password_token_is_single_use(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            with patch("varavu_selavu_service.auth.routers._send_verification_email"):
                _register_and_login(test_client, "onetimereset@test.com", password="old-pw")

            captured = {}
            with patch("varavu_selavu_service.auth.routers._send_password_reset_email", side_effect=lambda email, token: captured.update(token=token)):
                test_client.post("/api/v1/auth/forgot-password", json={"email": "onetimereset@test.com"})

            first = test_client.post("/api/v1/auth/reset-password", json={"token": captured["token"], "password": "new-pw-1"})
            assert first.status_code == 200
            second = test_client.post("/api/v1/auth/reset-password", json={"token": captured["token"], "password": "new-pw-2"})
            assert second.status_code == 400
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_reset_password_rejects_expired_token(self, test_client, db_session):
        old = _drop_auth_override()
        try:
            with patch("varavu_selavu_service.auth.routers._send_verification_email"):
                _register_and_login(test_client, "expiredreset@test.com", password="old-pw")

            captured = {}
            with patch("varavu_selavu_service.auth.routers._send_password_reset_email", side_effect=lambda email, token: captured.update(token=token)):
                test_client.post("/api/v1/auth/forgot-password", json={"email": "expiredreset@test.com"})

            _backdate_token(db_session, "reset_password", by=timedelta(hours=2))
            resp = test_client.post("/api/v1/auth/reset-password", json={"token": captured["token"], "password": "new-pw"})
            assert resp.status_code == 400
        finally:
            test_client.cookies.clear()
            _restore_auth_override(old)

    def test_reset_password_rejects_garbage_token(self, test_client, db_session):
        resp = test_client.post("/api/v1/auth/reset-password", json={"token": "garbage", "password": "new-pw"})
        assert resp.status_code == 400
