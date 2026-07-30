"""Behaviours the pre-launch audit verified as already correct.

This suite exists so the remediation work (cookie auth, CSRF, sanitization,
money constraints, the unified balance engine) cannot quietly undo any of them.
Each test maps to a bullet from the brief's "do NOT regress" list.
"""

import base64
import json
import os
import uuid

import pytest
from jose import jwt

from varavu_selavu_service.auth.cookies import CSRF_HEADER
from varavu_selavu_service.auth.security import ALGORITHM, auth_required, create_access_token
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import Expense, Group, GroupMember, User
from varavu_selavu_service.main import app


@pytest.fixture(autouse=True)
def _groups_enabled():
    old_val = os.environ.get("GROUPS_ENABLED")
    os.environ["GROUPS_ENABLED"] = "true"
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["GROUPS_ENABLED"] = old_val
        else:
            os.environ.pop("GROUPS_ENABLED", None)


@pytest.fixture
def real_auth(test_client):
    """Drops the conftest auth override so real token validation runs."""
    saved = app.dependency_overrides.pop(auth_required, None)
    test_client.cookies.clear()
    try:
        yield
    finally:
        test_client.cookies.clear()
        if saved is not None:
            app.dependency_overrides[auth_required] = saved


def _forge_alg_none_token(email: str) -> str:
    """Hand-rolled because python-jose refuses to *encode* alg:none — which is
    the point: the attacker's tooling has no such scruples."""

    def b64(obj: dict) -> str:
        raw = json.dumps(obj, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f'{b64({"alg": "none", "typ": "JWT"})}.{b64({"sub": email, "type": "access"})}.'


def _as_user(email: str):
    old = app.dependency_overrides.get(auth_required)
    app.dependency_overrides[auth_required] = lambda: email
    return old


def _restore(old):
    if old is not None:
        app.dependency_overrides[auth_required] = old
    else:
        app.dependency_overrides.pop(auth_required, None)


# ----------------------------------------------------------------------
# "API returns 401 for missing/invalid token; alg:none forged tokens are rejected."
# ----------------------------------------------------------------------


class TestTokenRejection:
    def test_missing_token_returns_401(self, test_client, db_session, real_auth):
        assert test_client.get("/api/v1/auth/me").status_code == 401

    def test_garbage_token_returns_401(self, test_client, db_session, real_auth):
        res = test_client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
        assert res.status_code == 401

    def test_alg_none_forged_token_is_rejected(self, test_client, db_session, real_auth):
        """An unsigned token claiming to be a real user must never authenticate."""
        forged = _forge_alg_none_token("attacker@test.com")
        res = test_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
        assert res.status_code == 401

    def test_token_signed_with_the_wrong_secret_is_rejected(self, test_client, db_session, real_auth):
        forged = jwt.encode(
            {"sub": "attacker@test.com", "type": "access"}, "not-the-real-secret", algorithm=ALGORITHM
        )
        res = test_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
        assert res.status_code == 401

    def test_a_refresh_token_cannot_be_used_as_an_access_token(self, test_client, db_session, real_auth):
        from varavu_selavu_service.auth.security import create_refresh_token

        refresh = create_refresh_token({"sub": "someone@test.com"})
        res = test_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh}"})
        assert res.status_code == 401

    def test_a_forged_access_cookie_is_rejected(self, test_client, db_session, real_auth):
        """The cookie path must validate exactly as strictly as the header path."""
        from varavu_selavu_service.auth.cookies import ACCESS_COOKIE

        forged = _forge_alg_none_token("attacker@test.com")
        test_client.cookies.set(ACCESS_COOKIE, forged)
        try:
            assert test_client.get("/api/v1/auth/me").status_code == 401
        finally:
            test_client.cookies.clear()


# ----------------------------------------------------------------------
# "Non-members get 403 'Not a member of this group'."
# ----------------------------------------------------------------------


class TestGroupAuthorization:
    @staticmethod
    def _group_owned_by_someone_else(test_client, db_session):
        group_id = test_client.post("/api/v1/groups", json={"name": "Private"}).json()["group_id"]
        db_session.add(User(id=uuid.uuid4(), email="stranger@test.com", password_hash="h", name="S"))
        db_session.commit()
        return group_id

    @pytest.mark.parametrize(
        "path",
        ["", "/balances", "/expenses", "/activity", "/export.csv"],
    )
    def test_non_member_is_forbidden_on_group_subresources(self, test_client, db_session, path):
        group_id = self._group_owned_by_someone_else(test_client, db_session)
        old = _as_user("stranger@test.com")
        try:
            res = test_client.get(f"/api/v1/groups/{group_id}{path}")
            assert res.status_code == 403, f"{path} -> {res.status_code}"
        finally:
            _restore(old)

    def test_forbidden_message_is_unchanged(self, test_client, db_session):
        group_id = self._group_owned_by_someone_else(test_client, db_session)
        old = _as_user("stranger@test.com")
        try:
            res = test_client.get(f"/api/v1/groups/{group_id}/balances")
            assert res.json()["detail"] == "Not a member of this group"
        finally:
            _restore(old)

    def test_non_member_cannot_post_an_expense_to_the_group(self, test_client, db_session):
        group_id = self._group_owned_by_someone_else(test_client, db_session)
        member = (
            db_session.query(GroupMember).filter(GroupMember.group_id == uuid.UUID(group_id)).first()
        )
        old = _as_user("stranger@test.com")
        try:
            res = test_client.post(
                f"/api/v1/groups/{group_id}/expenses",
                json={
                    "date": "01/15/2026", "description": "Sneaky", "category": "Food",
                    "amount": 10.00,
                    "payers": [{"member_id": str(member.id), "amount_paid": 10.00}],
                    "split": {"type": "equal", "entries": [{"member_id": str(member.id)}]},
                },
            )
            assert res.status_code == 403
        finally:
            _restore(old)


# ----------------------------------------------------------------------
# "Server derives identity from the JWT — client-supplied ?user_id= is ignored."
# ----------------------------------------------------------------------


class TestIdentityIsServerDerived:
    def test_expenses_ignores_a_user_id_override(self, test_client, db_session):
        import datetime

        db_session.add(User(id=uuid.uuid4(), email="victim@test.com", password_hash="h", name="V"))
        db_session.commit()
        db_session.add(
            Expense(
                id=uuid.uuid4(), user_email="victim@test.com", purchased_at=datetime.datetime(2026, 1, 1),
                category_id="Food", amount=999.00, description="VICTIM SECRET",
            )
        )
        db_session.commit()

        res = test_client.get("/api/v1/expenses", params={"user_id": "victim@test.com"})
        assert res.status_code == 200
        descriptions = [item["description"] for item in res.json()["items"]]
        assert "VICTIM SECRET" not in descriptions

    def test_analysis_ignores_a_user_id_override(self, test_client, db_session):
        import datetime

        db_session.add(User(id=uuid.uuid4(), email="victim2@test.com", password_hash="h", name="V"))
        db_session.commit()
        db_session.add(
            Expense(
                id=uuid.uuid4(), user_email="victim2@test.com", purchased_at=datetime.datetime(2026, 1, 1),
                category_id="Food", amount=777.00, description="Theirs",
            )
        )
        db_session.commit()

        res = test_client.get("/api/v1/analysis", params={"user_id": "victim2@test.com"})
        assert res.status_code == 200
        assert res.json()["total_expenses"] != 777.00


# ----------------------------------------------------------------------
# "Deleting a group with outstanding balances returns 409 and requires ?force=true."
# ----------------------------------------------------------------------


class TestDeleteGuard:
    @staticmethod
    def _group_with_outstanding_balance(test_client, db_session):
        db_session.add(User(id=uuid.uuid4(), email="debtor@test.com", password_hash="h", name="D"))
        db_session.commit()
        group_id = test_client.post("/api/v1/groups", json={"name": "Owing"}).json()["group_id"]
        other = test_client.post(
            f"/api/v1/groups/{group_id}/members", json={"email": "debtor@test.com"}
        ).json()["member_id"]
        mine = (
            db_session.query(GroupMember)
            .filter(GroupMember.group_id == uuid.UUID(group_id), GroupMember.user_email == "test@user.com")
            .first()
        )
        test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026", "description": "Dinner", "category": "Food",
                "amount": 50.00,
                "payers": [{"member_id": str(mine.id), "amount_paid": 50.00}],
                "split": {
                    "type": "equal",
                    "entries": [{"member_id": str(mine.id)}, {"member_id": other}],
                },
            },
        )
        return group_id

    def test_delete_with_outstanding_balance_returns_409(self, test_client, db_session):
        group_id = self._group_with_outstanding_balance(test_client, db_session)
        res = test_client.delete(f"/api/v1/groups/{group_id}")
        assert res.status_code == 409

    def test_delete_with_force_true_succeeds(self, test_client, db_session):
        group_id = self._group_with_outstanding_balance(test_client, db_session)
        res = test_client.delete(f"/api/v1/groups/{group_id}?force=true")
        assert res.status_code in (200, 204), res.text

    def test_soft_delete_keeps_the_row_with_deleted_at_set(self, test_client, db_session):
        group_id = self._group_with_outstanding_balance(test_client, db_session)
        test_client.delete(f"/api/v1/groups/{group_id}?force=true")

        group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
        assert group is not None, "delete must be soft, not a hard row removal"
        assert group.deleted_at is not None


# ----------------------------------------------------------------------
# "Split types Equal/Exact/Percentage/Shares/Adjustment" still resolve.
# ----------------------------------------------------------------------


class TestSplitTypesStillWork:
    @staticmethod
    def _two_member_group(test_client, db_session):
        db_session.add(User(id=uuid.uuid4(), email="split@test.com", password_hash="h", name="S"))
        db_session.commit()
        group_id = test_client.post("/api/v1/groups", json={"name": "Split"}).json()["group_id"]
        other = test_client.post(
            f"/api/v1/groups/{group_id}/members", json={"email": "split@test.com"}
        ).json()["member_id"]
        mine = (
            db_session.query(GroupMember)
            .filter(GroupMember.group_id == uuid.UUID(group_id), GroupMember.user_email == "test@user.com")
            .first()
        )
        return group_id, str(mine.id), other

    @pytest.mark.parametrize(
        "split",
        [
            pytest.param({"type": "equal", "entries": [{"member_id": "A"}, {"member_id": "B"}]}, id="equal"),
            pytest.param(
                {"type": "exact", "entries": [{"member_id": "A", "value": 60.0}, {"member_id": "B", "value": 40.0}]},
                id="exact",
            ),
            pytest.param(
                {"type": "percentage", "entries": [{"member_id": "A", "value": 60.0}, {"member_id": "B", "value": 40.0}]},
                id="percentage",
            ),
            pytest.param(
                {"type": "shares", "entries": [{"member_id": "A", "value": 3.0}, {"member_id": "B", "value": 1.0}]},
                id="shares",
            ),
            pytest.param(
                {"type": "adjustment", "entries": [{"member_id": "A", "value": 10.0}, {"member_id": "B", "value": 0.0}]},
                id="adjustment",
            ),
        ],
    )
    def test_split_type_persists_and_nets_to_zero(self, test_client, db_session, split):
        group_id, mine, other = self._two_member_group(test_client, db_session)
        resolved = {
            "type": split["type"],
            "entries": [
                {**e, "member_id": mine if e["member_id"] == "A" else other} for e in split["entries"]
            ],
        }

        res = test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026", "description": "Dinner", "category": "Food",
                "amount": 100.00,
                "payers": [{"member_id": mine, "amount_paid": 100.00}],
                "split": resolved,
            },
        )
        assert res.status_code == 201, res.text

        balances = test_client.get(f"/api/v1/groups/{group_id}/balances").json()
        assert round(sum(row["net"] for row in balances["members"]), 2) == 0.0


# ----------------------------------------------------------------------
# Cookie auth must not have loosened anything for state-changing requests.
# ----------------------------------------------------------------------


class TestCookieAuthDoesNotWeakenAuthz:
    def test_csrf_does_not_let_an_unauthenticated_caller_through(self, test_client, db_session, real_auth):
        """A valid CSRF pair is not a substitute for authentication."""
        test_client.cookies.set("vs_csrf", "matching")
        try:
            res = test_client.put(
                "/api/v1/auth/profile",
                json={"name": "Nope"},
                headers={CSRF_HEADER: "matching"},
            )
            assert res.status_code == 401
        finally:
            test_client.cookies.clear()
