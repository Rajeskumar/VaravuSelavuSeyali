"""
tests/test_groups_e2e.py — TS-GRP-111 Phase-1 end-to-end tests.

Exercises Priya's user stories 1, 2, 4, 5, 6 (spec §2/§16 exit criteria) through
the real HTTP surface (not service-layer calls directly), plus the flag-gating
and back-compat requirements from §13.4. Each test starts from the SQLite
in-memory DB provided by conftest.py's `test_client`/`db_session` fixtures.
"""
import os
import uuid

import pytest

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.models import Group, GroupMember, User
from varavu_selavu_service.main import app
from varavu_selavu_service.services.analysis_service import AnalysisService


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


def _as_user(email: str):
    old = app.dependency_overrides.get(auth_required)
    app.dependency_overrides[auth_required] = lambda: email
    return old


def _restore(old):
    if old is not None:
        app.dependency_overrides[auth_required] = old
    else:
        app.dependency_overrides.pop(auth_required, None)


def _make_group_with_members(test_client, db_session, other_emails, name="Apartment 4B"):
    """test@user.com (the default auth override, i.e. "Priya") is the admin/creator."""
    for email in other_emails:
        db_session.add(User(id=uuid.uuid4(), email=email, password_hash="hash", name=email.split("@")[0]))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": name})
    group_id = create_res.json()["group_id"]

    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    member_ids = {}
    admin_member = (
        db_session.query(GroupMember)
        .filter(GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com")
        .first()
    )
    member_ids["test@user.com"] = str(admin_member.id)

    for email in other_emails:
        res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": email})
        member_ids[email] = res.json()["member_id"]

    return group_id, member_ids


# ---------------------------------------------------------------------------
# Story 1 — "As a user, I create a group 'Apartment 4B' with roommates Arun and
# Meera by email, so shared rent and utilities live in one place." Meera isn't
# on TrackSpense yet — she's added as a placeholder and gets an invite link.
# ---------------------------------------------------------------------------
def test_priya_story_1_create_group_with_registered_and_placeholder_member_and_invite(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="arun@test.com", password_hash="hash", name="Arun"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Apartment 4B"})
    assert create_res.status_code == 201
    group_id = create_res.json()["group_id"]

    arun_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "arun@test.com"})
    assert arun_res.status_code == 201
    assert arun_res.json()["status"] == "active"

    meera_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"display_name": "Meera"})
    assert meera_res.status_code == 201
    assert meera_res.json()["status"] == "invited"
    assert meera_res.json()["user_email"] is None
    meera_member_id = meera_res.json()["member_id"]

    invite_res = test_client.post(f"/api/v1/groups/{group_id}/invites", json={"member_id": meera_member_id})
    assert invite_res.status_code == 201
    assert invite_res.json()["token"]
    assert invite_res.json()["url"]

    detail_res = test_client.get(f"/api/v1/groups/{group_id}")
    assert detail_res.status_code == 200
    assert len(detail_res.json()["members"]) == 3


# ---------------------------------------------------------------------------
# Story 2 — "I scan the grocery receipt; TrackSpense parses it; I mark it as a
# group expense, I paid, split equally among 3." My analytics show only my
# share under Food & Drink (the group_id IS NULL double-count guard, §9.1).
# ---------------------------------------------------------------------------
def test_priya_story_2_group_expense_shows_only_my_share_in_combined_analytics(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["arun@test.com", "meera@test.com"])
    AnalysisService(db_session).invalidate_cache()

    expense_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Groceries",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    assert expense_res.status_code == 201
    assert expense_res.json()["expense"]["my_share"] == 30.00

    analysis_res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "scope": "combined"})
    assert analysis_res.status_code == 200
    body = analysis_res.json()
    assert body["total_expenses"] == 30.00  # Priya's share only, not the full $90
    food_total = next((c["total"] for c in body["category_totals"] if c["category"] == "Food & Drink"), None)
    assert food_total == 30.00


# ---------------------------------------------------------------------------
# Story 4 — "The group page shows Arun owes me $42.17 and I owe Meera $10."
# Σ net(m) == 0 always (§3.3/§7.1 invariant).
# ---------------------------------------------------------------------------
def test_priya_story_4_balances_reflect_payers_and_splits_net_zero(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["arun@test.com", "meera@test.com"])

    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Rent",
            "category": "Housing",
            "amount": 90.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )

    balances_res = test_client.get(f"/api/v1/groups/{group_id}/balances")
    assert balances_res.status_code == 200
    members = balances_res.json()["members"]

    net_sum = round(sum(mem["net"] for mem in members), 2)
    assert net_sum == 0.0  # §3.3/§7.1 invariant

    priya_net = next(mem["net"] for mem in members if mem["member_id"] == m["test@user.com"])
    assert priya_net == 60.00  # paid 90, owes 30 -> net +60 (owed by the other two)


# ---------------------------------------------------------------------------
# Story 5 — "Arun pays me cash; I record a $42.17 settlement; balances update;
# my spend analytics don't change." (TS-GRP-R2: settlements are never spend.)
# ---------------------------------------------------------------------------
def test_priya_story_5_settle_up_updates_balances_without_affecting_spend_analytics(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["arun@test.com"])
    AnalysisService(db_session).invalidate_cache()

    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 100.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 100.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )

    before_res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "scope": "combined"})
    before_total = before_res.json()["total_expenses"]
    assert before_total == 50.00  # Priya's share only

    settle_res = test_client.post(
        f"/api/v1/groups/{group_id}/settlements",
        json={"from_member_id": m["arun@test.com"], "to_member_id": m["test@user.com"], "amount": 50.00},
    )
    assert settle_res.status_code == 201

    balances_res = test_client.get(f"/api/v1/groups/{group_id}/balances")
    members = balances_res.json()["members"]
    net_sum = round(sum(mem["net"] for mem in members), 2)
    assert net_sum == 0.0
    priya_net_after = next(mem["net"] for mem in members if mem["member_id"] == m["test@user.com"])
    assert priya_net_after == 0.0  # settled up

    after_res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "scope": "combined"})
    assert after_res.json()["total_expenses"] == before_total  # unchanged by the settlement


# ---------------------------------------------------------------------------
# Story 6 — "My monthly dashboard shows $1,830 total — $1,210 personal + $620
# in group shares — with a Personal/Group/Combined filter."
# ---------------------------------------------------------------------------
def test_priya_story_6_combined_dashboard_equals_personal_plus_group_shares(test_client, db_session):
    from varavu_selavu_service.db.models import Expense
    from datetime import datetime

    db_session.add(
        Expense(
            id=uuid.uuid4(),
            user_email="test@user.com",
            purchased_at=datetime(2026, 1, 10),
            category_id="Utilities",
            amount=120.00,
            description="Electric bill",
        )
    )
    db_session.commit()
    AnalysisService(db_session).invalidate_cache()

    group_id, m = _make_group_with_members(test_client, db_session, ["arun@test.com"])
    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Groceries",
            "category": "Food & Drink",
            "amount": 60.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 60.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    AnalysisService(db_session).invalidate_cache()

    personal_res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "scope": "personal"})
    groups_res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "scope": "groups"})
    combined_res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "scope": "combined"})

    assert personal_res.json()["total_expenses"] == 120.00
    assert groups_res.json()["total_expenses"] == 30.00  # Priya's half of the $60 group expense
    assert combined_res.json()["total_expenses"] == 150.00
    assert combined_res.json()["total_expenses"] == round(
        personal_res.json()["total_expenses"] + groups_res.json()["total_expenses"], 2
    )


# ---------------------------------------------------------------------------
# Flag gating (§13.4) — with GROUPS_ENABLED off, no group-related surface is
# reachable, and /analysis silently ignores scope/group_id.
# ---------------------------------------------------------------------------
def test_flag_off_hides_group_routes_and_downgrades_analysis_scope(test_client, db_session):
    group_id, m = _make_group_with_members(test_client, db_session, ["arun@test.com"])
    test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "01/15/2026",
            "description": "Groceries",
            "category": "Food & Drink",
            "amount": 60.00,
            "payers": [{"member_id": m["test@user.com"], "amount_paid": 60.00}],
            "split": {"type": "equal", "entries": [{"member_id": m[e]} for e in m]},
        },
    )
    AnalysisService(db_session).invalidate_cache()

    os.environ["GROUPS_ENABLED"] = "false"
    try:
        assert test_client.get("/api/v1/groups").status_code == 404
        assert test_client.get(f"/api/v1/groups/{group_id}").status_code == 404
        assert test_client.post(
            f"/api/v1/groups/{group_id}/expenses",
            json={
                "date": "01/15/2026",
                "description": "x",
                "category": "y",
                "amount": 10,
                "payers": [{"member_id": m["test@user.com"], "amount_paid": 10}],
                "split": {"type": "equal", "entries": [{"member_id": m["test@user.com"]}]},
            },
        ).status_code == 404
        assert test_client.post(
            f"/api/v1/groups/{group_id}/settlements",
            json={"from_member_id": m["arun@test.com"], "to_member_id": m["test@user.com"], "amount": 1},
        ).status_code == 404
        assert test_client.post(
            "/api/v1/devices/register", json={"expo_push_token": "x", "platform": "ios"}
        ).status_code == 404

        # A client that still sends scope=combined must be silently downgraded to
        # personal-only — the $30 group share must not leak through with the flag off.
        analysis_res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 1, "scope": "combined"})
        assert analysis_res.status_code == 200
        assert analysis_res.json()["scope"] == "personal"
        assert analysis_res.json()["total_expenses"] == 0.0  # Priya has no personal expenses this month
        assert analysis_res.json()["spend_breakdown"] is None
        assert analysis_res.json()["group_summaries"] is None
    finally:
        os.environ["GROUPS_ENABLED"] = "true"


def test_flag_on_group_routes_are_reachable(test_client, db_session):
    res = test_client.post("/api/v1/groups", json={"name": "Flag On Check"})
    assert res.status_code == 201


# ---------------------------------------------------------------------------
# Back-compat (§13.2) — a legacy no-scope /analysis call is untouched by the
# feature, regardless of GROUPS_ENABLED. (Companion to the more granular
# assertions already in tests/test_analytics_api.py.)
# ---------------------------------------------------------------------------
def test_legacy_no_scope_analysis_call_matches_pre_feature_shape_and_values(test_client, db_session):
    from varavu_selavu_service.db.models import Expense
    from datetime import datetime

    db_session.add(
        Expense(
            id=uuid.uuid4(),
            user_email="test@user.com",
            purchased_at=datetime(2026, 2, 1),
            category_id="Food",
            amount=25.0,
            description="Groceries",
        )
    )
    db_session.commit()
    AnalysisService(db_session).invalidate_cache()

    res = test_client.get("/api/v1/analysis", params={"year": 2026, "month": 2})
    assert res.status_code == 200
    body = res.json()
    assert set(body.keys()) == {
        "top_categories",
        "category_totals",
        "monthly_trend",
        "total_expenses",
        "category_expense_details",
        "filter_info",
        "scope",
        "spend_breakdown",
        "group_summaries",
    }
    assert body["total_expenses"] == 25.0
    assert body["scope"] == "personal"
    assert body["spend_breakdown"] is None
    assert body["group_summaries"] is None
