"""tests/test_tags_bulk.py — TS-TAG-105 bulk apply/remove API (PRD §10.3)."""
import os
import uuid
from datetime import datetime

import pytest

from varavu_selavu_service.db.models import Expense, ExpenseTag, Group, GroupMember, User
from varavu_selavu_service.services.group_service import GroupService


@pytest.fixture(autouse=True)
def _tags_and_groups_enabled():
    old_tags = os.environ.get("TAGS_ENABLED")
    old_groups = os.environ.get("GROUPS_ENABLED")
    os.environ["TAGS_ENABLED"] = "true"
    os.environ["GROUPS_ENABLED"] = "true"
    try:
        yield
    finally:
        for key, old in (("TAGS_ENABLED", old_tags), ("GROUPS_ENABLED", old_groups)):
            if old is not None:
                os.environ[key] = old
            else:
                os.environ.pop(key, None)


def _seed_personal_expenses(db_session, n=3, category="Shopping", amount=50.0, user_email="test@user.com"):
    ids = []
    for i in range(n):
        exp = Expense(id=uuid.uuid4(), user_email=user_email, purchased_at=datetime(2026, 7, 5 + i), category_id=category, amount=amount, description=f"Item {i}")
        db_session.add(exp)
        ids.append(exp.id)
    db_session.commit()
    return ids


def _seed_two_member_group_with_expense(test_client, db_session, amount=90.0):
    db_session.add(User(id=uuid.uuid4(), email="b@test.com", password_hash="hash", name="B"))
    db_session.commit()

    create_res = test_client.post("/api/v1/groups", json={"name": "Trip"})
    group_id = create_res.json()["group_id"]
    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    admin_member = db_session.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_email == "test@user.com").first()
    member_res = test_client.post(f"/api/v1/groups/{group_id}/members", json={"email": "b@test.com"})
    member_ids = {"test@user.com": str(admin_member.id), "b@test.com": member_res.json()["member_id"]}

    expense_res = test_client.post(
        f"/api/v1/groups/{group_id}/expenses",
        json={
            "date": "07/06/2026", "description": "Dinner", "category": "Food & Drink", "amount": amount,
            "payers": [{"member_id": member_ids["test@user.com"], "amount_paid": amount}],
            "split": {"type": "equal", "entries": [{"member_id": member_ids["test@user.com"]}, {"member_id": member_ids["b@test.com"]}]},
        },
    )
    return group_id, expense_res.json()["expense"]["row_id"]


def test_bulk_apply_requires_exactly_one_of_tag_id_or_tag_name(test_client, db_session):
    ids = _seed_personal_expenses(db_session, n=1)
    res = test_client.post("/api/v1/tags/bulk_apply", json={"expense_ids": [str(i) for i in ids], "dry_run": True})
    assert res.status_code == 422


def test_bulk_apply_requires_exactly_one_of_expense_ids_or_filter(test_client, db_session):
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": tag["id"], "expense_ids": ["x"], "filter": {"start_date": "2026-07-01"}, "dry_run": True,
    })
    assert res.status_code == 422


def test_bulk_apply_dry_run_previews_without_writing(test_client, db_session):
    ids = _seed_personal_expenses(db_session, n=3, amount=100.0)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": tag["id"], "expense_ids": [str(i) for i in ids], "dry_run": True,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["matched_count"] == 3
    assert body["already_tagged_count"] == 0
    assert body["applied_count"] == 0  # dry run
    assert body["my_expenses_total"] == 300.0
    assert body["i_paid_total"] == 300.0

    assert db_session.query(ExpenseTag).count() == 0  # nothing actually written


def test_bulk_apply_writes_when_not_dry_run(test_client, db_session):
    ids = _seed_personal_expenses(db_session, n=3)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": tag["id"], "expense_ids": [str(i) for i in ids], "dry_run": False,
    })
    assert res.status_code == 200
    assert res.json()["applied_count"] == 3
    assert db_session.query(ExpenseTag).filter(ExpenseTag.tag_id == uuid.UUID(tag["id"])).count() == 3


def test_bulk_apply_is_idempotent_across_repeated_calls(test_client, db_session):
    ids = _seed_personal_expenses(db_session, n=3)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    payload = {"tag_id": tag["id"], "expense_ids": [str(i) for i in ids], "dry_run": False}

    test_client.post("/api/v1/tags/bulk_apply", json=payload)
    res = test_client.post("/api/v1/tags/bulk_apply", json=payload)
    assert res.json()["already_tagged_count"] == 3
    assert res.json()["applied_count"] == 0
    assert db_session.query(ExpenseTag).count() == 3  # not duplicated


def test_bulk_apply_by_tag_name_creates_inline(test_client, db_session):
    from varavu_selavu_service.db.models import Tag
    ids = _seed_personal_expenses(db_session, n=2)
    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_name": "Brand New", "expense_ids": [str(i) for i in ids], "dry_run": False,
    })
    assert res.status_code == 200
    assert res.json()["applied_count"] == 2
    assert db_session.query(Tag).filter(Tag.user_email == "test@user.com", Tag.name == "Brand New").first() is not None


def test_bulk_apply_by_date_range_filter(test_client, db_session):
    _seed_personal_expenses(db_session, n=3)  # 07/05, 07/06, 07/07
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": tag["id"],
        "filter": {"start_date": "2026-07-05", "end_date": "2026-07-06"},
        "dry_run": True,
    })
    assert res.json()["matched_count"] == 2  # only 07/05 and 07/06


def test_bulk_apply_filter_by_category(test_client, db_session):
    _seed_personal_expenses(db_session, n=2, category="Shopping")
    _seed_personal_expenses(db_session, n=1, category="Groceries")
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": tag["id"], "filter": {"category": "Groceries"}, "dry_run": True,
    })
    assert res.json()["matched_count"] == 1


def test_bulk_apply_filter_includes_group_expenses_by_default(test_client, db_session):
    """PRD user story #2: a plain date-range apply already includes the user's group spend, not
    just personal — the group filter is a narrowing option, not a requirement."""
    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session, amount=90.0)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": tag["id"], "filter": {"start_date": "2026-07-01", "end_date": "2026-07-31"}, "dry_run": True,
    })
    assert res.json()["matched_count"] == 1
    assert res.json()["my_expenses_total"] == 45.0  # half of $90 (equal split)
    assert res.json()["i_paid_total"] == 90.0  # test@user.com paid the full amount


def test_bulk_apply_filter_narrows_to_specific_group(test_client, db_session):
    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session)
    _seed_personal_expenses(db_session, n=2)  # same date range, different (no) group
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": tag["id"],
        "filter": {"start_date": "2026-07-01", "end_date": "2026-07-31", "group_id": group_id},
        "dry_run": True,
    })
    assert res.json()["matched_count"] == 1  # only the group expense, personal ones excluded


def test_bulk_apply_excludes_expenses_from_groups_the_user_is_not_in(test_client, db_session):
    """Even via the explicit expense_ids path — access is enforced, not just trusted from input."""
    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session)
    db_session.add(User(id=uuid.uuid4(), email="outsider@user.com", password_hash="hash", name="Outsider"))
    db_session.commit()
    outsider_exp = Expense(id=uuid.uuid4(), user_email="outsider@user.com", purchased_at=datetime(2026, 7, 6), category_id="Shopping", amount=10.0, description="not mine")
    db_session.add(outsider_exp)
    db_session.commit()

    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": tag["id"], "expense_ids": [expense_id, str(outsider_exp.id)], "dry_run": True,
    })
    assert res.json()["matched_count"] == 1  # the outsider's expense silently excluded


def test_bulk_apply_enforces_max_bulk_size(test_client, db_session, monkeypatch):
    monkeypatch.setenv("TAG_BULK_MAX", "2")
    ids = _seed_personal_expenses(db_session, n=3)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": tag["id"], "expense_ids": [str(i) for i in ids], "dry_run": True,
    })
    assert res.status_code == 422


def test_bulk_apply_skips_expenses_already_at_max_tags_per_expense(test_client, db_session, monkeypatch):
    monkeypatch.setenv("TAG_MAX_PER_EXPENSE", "1")
    ids = _seed_personal_expenses(db_session, n=2)
    existing_tag = test_client.post("/api/v1/tags", json={"name": "Existing"}).json()
    test_client.post(f"/api/v1/expenses/{ids[0]}/tags", json={"tag_ids": [existing_tag["id"]]})

    new_tag = test_client.post("/api/v1/tags", json={"name": "New"}).json()
    res = test_client.post("/api/v1/tags/bulk_apply", json={
        "tag_id": new_tag["id"], "expense_ids": [str(i) for i in ids], "dry_run": False,
    })
    assert res.json()["applied_count"] == 1  # only ids[1] — ids[0] is already at its cap


# ─── bulk_remove ────────────────────────────────


def test_bulk_remove_writes_when_not_dry_run(test_client, db_session):
    ids = _seed_personal_expenses(db_session, n=3)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    test_client.post("/api/v1/tags/bulk_apply", json={"tag_id": tag["id"], "expense_ids": [str(i) for i in ids], "dry_run": False})

    res = test_client.post("/api/v1/tags/bulk_remove", json={"tag_id": tag["id"], "expense_ids": [str(i) for i in ids], "dry_run": False})
    assert res.json()["applied_count"] == 3
    assert db_session.query(ExpenseTag).count() == 0


def test_bulk_remove_by_nonexistent_tag_name_is_a_noop_not_an_error(test_client, db_session):
    from varavu_selavu_service.db.models import Tag
    ids = _seed_personal_expenses(db_session, n=2)
    res = test_client.post("/api/v1/tags/bulk_remove", json={"tag_name": "Never Created", "expense_ids": [str(i) for i in ids], "dry_run": False})
    assert res.status_code == 200
    assert res.json()["applied_count"] == 0
    assert res.json()["already_tagged_count"] == 2
    # Critically: must NOT have created a tag just to check.
    assert db_session.query(Tag).filter(Tag.user_email == "test@user.com", Tag.name == "Never Created").first() is None


def test_bulk_remove_already_tagged_count_reflects_untagged_ones(test_client, db_session):
    ids = _seed_personal_expenses(db_session, n=3)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    # Only tag the first two.
    test_client.post("/api/v1/tags/bulk_apply", json={"tag_id": tag["id"], "expense_ids": [str(ids[0]), str(ids[1])], "dry_run": False})

    res = test_client.post("/api/v1/tags/bulk_remove", json={"tag_id": tag["id"], "expense_ids": [str(i) for i in ids], "dry_run": True})
    assert res.json()["matched_count"] == 3
    assert res.json()["already_tagged_count"] == 1  # ids[2] was never tagged
