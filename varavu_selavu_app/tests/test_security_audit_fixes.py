"""Regression tests for the security-audit remediation (findings VS-05..VS-16).

Each test names the finding it guards so a future change that reopens one fails loudly.
"""

import os
import uuid

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.core.upload_safety import content_type_matches, sniff_media_type
from varavu_selavu_service.db.models import Group, GroupMember, Settlement, User
from varavu_selavu_service.main import app


@pytest.fixture(autouse=True)
def _groups_enabled():
    old = os.environ.get("GROUPS_ENABLED")
    os.environ["GROUPS_ENABLED"] = "true"
    try:
        yield
    finally:
        if old is not None:
            os.environ["GROUPS_ENABLED"] = old
        else:
            os.environ.pop("GROUPS_ENABLED", None)


@pytest.fixture(autouse=True)
def _restore_auth_override():
    """Every test here reassigns the auth override; without restoring it the *next* test file
    runs as a user that does not exist in its fresh database and fails on foreign keys."""
    saved = app.dependency_overrides.get(auth_required)
    yield
    if saved is not None:
        app.dependency_overrides[auth_required] = saved
    else:
        app.dependency_overrides.pop(auth_required, None)


def _as(email):
    app.dependency_overrides[auth_required] = lambda: email


def _seed(db, email, verified=True):
    db.add(User(id=uuid.uuid4(), email=email, name=email, password_hash="!", email_verified=verified))
    db.commit()


class TestVS06LegacySessionEndpointRemoved:
    def test_session_exchange_endpoint_is_gone(self, test_client, db_session):
        assert test_client.post("/api/v1/auth/session", json={"refresh_token": "x"}).status_code == 404

    def test_exchange_helper_is_gone_from_the_service(self):
        from varavu_selavu_service.auth.service import AuthService

        assert not hasattr(AuthService, "exchange_legacy_refresh_token")


class TestVS07EmailVerificationGate:
    def test_unverified_user_cannot_create_a_group(self, test_client, db_session):
        _seed(db_session, "unverified@x.com", verified=False)
        _as("unverified@x.com")
        res = test_client.post("/api/v1/groups", json={"name": "Trip"})
        assert res.status_code == 403
        assert "verify" in res.json()["detail"].lower()

    def test_verified_user_can_create_a_group(self, test_client, db_session):
        _seed(db_session, "verified@x.com", verified=True)
        _as("verified@x.com")
        assert test_client.post("/api/v1/groups", json={"name": "Trip"}).status_code == 201

    def test_unverified_user_cannot_be_added_to_a_group(self, test_client, db_session):
        _seed(db_session, "owner@x.com", verified=True)
        _seed(db_session, "notyet@x.com", verified=False)
        _as("owner@x.com")
        gid = test_client.post("/api/v1/groups", json={"name": "Flat"}).json()["group_id"]
        res = test_client.post(f"/api/v1/groups/{gid}/members", json={"email": "notyet@x.com"})
        assert res.status_code == 400
        assert "verified" in res.json()["detail"].lower()

    def test_personal_expenses_still_work_while_unverified(self, test_client, db_session):
        """The gate is scoped to groups on purpose — a solo user must not be locked out."""
        _seed(db_session, "solo@x.com", verified=False)
        _as("solo@x.com")
        res = test_client.post("/api/v1/expenses", json={
            "user_id": "solo@x.com", "date": "01/05/2026", "description": "Coffee",
            "category": "Food", "cost": 4.5})
        assert res.status_code in (200, 201), res.text


class TestVS08SettlementDeletion:
    def _group_with_two_members(self, test_client, db_session):
        _seed(db_session, "admin@x.com")
        _seed(db_session, "member@x.com")
        _as("admin@x.com")
        gid = test_client.post("/api/v1/groups", json={"name": "Trip"}).json()["group_id"]
        test_client.post(f"/api/v1/groups/{gid}/members", json={"email": "member@x.com"})
        members = test_client.get(f"/api/v1/groups/{gid}").json()["members"]
        ids = {m["user_email"]: m["member_id"] for m in members}
        return gid, ids

    def test_member_cannot_delete_a_settlement_recorded_by_someone_else(self, test_client, db_session):
        gid, ids = self._group_with_two_members(test_client, db_session)
        _as("admin@x.com")
        sid = test_client.post(f"/api/v1/groups/{gid}/settlements", json={
            "from_member_id": ids["member@x.com"], "to_member_id": ids["admin@x.com"],
            "amount": 50}).json()["id"]

        # The person the settlement says *paid* is the one with a motive to erase the receipt.
        _as("member@x.com")
        res = test_client.delete(f"/api/v1/groups/{gid}/settlements/{sid}")
        assert res.status_code == 403

        assert db_session.query(Settlement).filter(Settlement.id == uuid.UUID(sid)).first() is not None

    def test_creator_can_delete_their_own_settlement(self, test_client, db_session):
        gid, ids = self._group_with_two_members(test_client, db_session)
        _as("admin@x.com")
        sid = test_client.post(f"/api/v1/groups/{gid}/settlements", json={
            "from_member_id": ids["member@x.com"], "to_member_id": ids["admin@x.com"],
            "amount": 50}).json()["id"]
        assert test_client.delete(f"/api/v1/groups/{gid}/settlements/{sid}").status_code == 200


class TestVS09UnownedExpenseUpdate:
    def test_updating_someone_elses_expense_404s_instead_of_faking_success(self, test_client, db_session):
        _seed(db_session, "owner2@x.com")
        _seed(db_session, "stranger@x.com")
        _as("owner2@x.com")
        created = test_client.post("/api/v1/expenses", json={
            "user_id": "owner2@x.com", "date": "01/05/2026", "description": "Rent",
            "category": "Home", "cost": 900})
        assert created.status_code in (200, 201), created.text
        # The create response's DTO doesn't surface the row id; read it back from the DB.
        from varavu_selavu_service.db.models import Expense

        eid = str(db_session.query(Expense).filter(Expense.user_email == "owner2@x.com").first().id)

        _as("stranger@x.com")
        res = test_client.put(f"/api/v1/expenses/{eid}", json={
            "user_id": "stranger@x.com", "date": "01/05/2026", "description": "HACKED",
            "category": "Home", "cost": 1})
        assert res.status_code == 404


class TestVS10EmailEndpointRequiresAuth:
    def test_anonymous_cannot_send_mail(self, test_client, db_session):
        app.dependency_overrides.pop(auth_required, None)
        try:
            res = test_client.post("/api/v1/email/send", json={
                "form_type": "contact_us", "user_email": "a@b.com",
                "subject": "s", "message_body": "m"})
            assert res.status_code == 401
        finally:
            _as("test@user.com")


class TestVS14UploadSniffing:
    def test_sniffer_identifies_real_signatures(self):
        assert sniff_media_type(b"\x89PNG\r\n\x1a\n rest") == "image/png"
        assert sniff_media_type(b"\xff\xd8\xff\xe0 rest") == "image/jpeg"
        assert sniff_media_type(b"%PDF-1.7 rest") == "application/pdf"

    def test_unknown_bytes_are_rejected_not_waved_through(self):
        assert sniff_media_type(b"just some text") is None
        assert content_type_matches("image/png", b"just some text") is False

    def test_declared_type_must_match_actual_bytes(self):
        assert content_type_matches("image/png", b"%PDF-1.7") is False
        assert content_type_matches("image/png", b"\x89PNG\r\n\x1a\n") is True


class TestVS15CurrencyValidation:
    def test_bogus_currency_is_rejected(self, test_client, db_session):
        _seed(db_session, "cur@x.com")
        _as("cur@x.com")
        res = test_client.post("/api/v1/groups", json={"name": "T", "currency": "../../etc/passwd"})
        assert res.status_code == 422

    def test_lowercase_iso_code_is_normalised(self, test_client, db_session):
        _seed(db_session, "cur2@x.com")
        _as("cur2@x.com")
        res = test_client.post("/api/v1/groups", json={"name": "T", "currency": "eur"})
        assert res.status_code == 201
        assert res.json()["currency"] == "EUR"


class TestVS16Hardening:
    def test_models_endpoint_requires_auth(self, test_client, db_session):
        app.dependency_overrides.pop(auth_required, None)
        try:
            assert test_client.get("/api/v1/models").status_code == 401
        finally:
            _as("test@user.com")

    def test_dummy_dashboard_endpoint_is_gone(self, test_client, db_session):
        assert test_client.get("/api/v1/dashboard").status_code == 404

    def test_password_longer_than_bcrypts_limit_is_rejected_not_truncated(self, test_client, db_session):
        res = test_client.post("/api/v1/auth/register", json={
            "name": "X", "email": "long@x.com", "password": "A" * 100})
        assert res.status_code == 422

    def test_payment_handle_rejects_junk(self, test_client, db_session):
        _seed(db_session, "ph@x.com")
        _as("ph@x.com")
        res = test_client.put("/api/v1/auth/profile", json={"venmo_handle": "a" * 200})
        assert res.status_code == 422
