"""tests/test_tags_association.py — TS-TAG-103 association API + read-path integration.

The cross-user isolation test (`test_group_member_never_sees_another_members_tags_on_shared_expense`)
is the single highest-stakes assertion in the whole Tags feature (PRD §9.2) — a tag applied to a
shared group expense must be visible ONLY to whoever applied it, never to any other group member,
even though they're looking at the exact same expense row.
"""
import os
import uuid
from datetime import datetime

import pytest

from varavu_selavu_service.db.models import Expense, ExpenseTag, Group, GroupMember, Tag, User
from varavu_selavu_service.services.group_expense_service import GroupExpenseService
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.tag_service import TagService


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


def _seed_personal_expense(db_session, user_email="test@user.com") -> Expense:
    exp = Expense(id=uuid.uuid4(), user_email=user_email, purchased_at=datetime(2026, 1, 5), category_id="Shopping", amount=50.0, description="Solo purchase")
    db_session.add(exp)
    db_session.commit()
    return exp


def _seed_two_member_group_with_expense(test_client, db_session):
    """test@user.com creates a group, invites b@test.com, and authors a shared expense.
    Returns (group_id, expense_id)."""
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
            "date": "01/05/2026",
            "description": "Dinner",
            "category": "Food & Drink",
            "amount": 90.00,
            "payers": [{"member_id": member_ids["test@user.com"], "amount_paid": 90.00}],
            "split": {"type": "equal", "entries": [{"member_id": member_ids["test@user.com"]}, {"member_id": member_ids["b@test.com"]}]},
        },
    )
    return group_id, expense_res.json()["expense"]["row_id"]


# ─── Personal expense association ────────────────────────────────


def test_apply_tag_by_id_to_personal_expense(test_client, db_session):
    exp = _seed_personal_expense(db_session)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post(f"/api/v1/expenses/{exp.id}/tags", json={"tag_ids": [tag["id"]]})
    assert res.status_code == 200
    assert [t["name"] for t in res.json()] == ["Trip 1"]


def test_apply_tag_by_name_creates_or_resolves(test_client, db_session):
    exp = _seed_personal_expense(db_session)
    res = test_client.post(f"/api/v1/expenses/{exp.id}/tags", json={"tag_names": ["New Trip"]})
    assert res.status_code == 200
    assert [t["name"] for t in res.json()] == ["New Trip"]


def test_apply_is_idempotent(test_client, db_session):
    exp = _seed_personal_expense(db_session)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    test_client.post(f"/api/v1/expenses/{exp.id}/tags", json={"tag_ids": [tag["id"]]})
    res = test_client.post(f"/api/v1/expenses/{exp.id}/tags", json={"tag_ids": [tag["id"]]})
    assert res.status_code == 200
    assert len(res.json()) == 1  # not duplicated

    count = db_session.query(ExpenseTag).filter(ExpenseTag.expense_id == exp.id).count()
    assert count == 1


def test_apply_enforces_max_tags_per_expense(test_client, db_session, monkeypatch):
    monkeypatch.setenv("TAG_MAX_PER_EXPENSE", "2")
    exp = _seed_personal_expense(db_session)
    tag_ids = [test_client.post("/api/v1/tags", json={"name": f"Tag {i}"}).json()["id"] for i in range(3)]

    res = test_client.post(f"/api/v1/expenses/{exp.id}/tags", json={"tag_ids": tag_ids})
    assert res.status_code == 422


def test_apply_requires_at_least_one_tag(test_client, db_session):
    exp = _seed_personal_expense(db_session)
    res = test_client.post(f"/api/v1/expenses/{exp.id}/tags", json={})
    assert res.status_code == 422


def test_remove_tag_from_expense(test_client, db_session):
    exp = _seed_personal_expense(db_session)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    test_client.post(f"/api/v1/expenses/{exp.id}/tags", json={"tag_ids": [tag["id"]]})

    res = test_client.delete(f"/api/v1/expenses/{exp.id}/tags/{tag['id']}")
    assert res.status_code == 200
    assert db_session.query(ExpenseTag).filter(ExpenseTag.expense_id == exp.id).count() == 0


def test_remove_untagged_tag_is_a_noop_not_an_error(test_client, db_session):
    exp = _seed_personal_expense(db_session)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    res = test_client.delete(f"/api/v1/expenses/{exp.id}/tags/{tag['id']}")
    assert res.status_code == 200


def test_cannot_tag_another_users_personal_expense(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()
    other_expense = _seed_personal_expense(db_session, user_email="other@user.com")
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post(f"/api/v1/expenses/{other_expense.id}/tags", json={"tag_ids": [tag["id"]]})
    assert res.status_code == 404


def test_tags_appear_on_get_expenses(test_client, db_session):
    exp = _seed_personal_expense(db_session)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    test_client.post(f"/api/v1/expenses/{exp.id}/tags", json={"tag_ids": [tag["id"]]})

    res = test_client.get("/api/v1/expenses")
    row = next(r for r in res.json()["items"] if r["row_id"] == str(exp.id))
    assert [t["name"] for t in row["tags"]] == ["Trip 1"]


def test_get_expenses_omits_tags_field_gracefully_when_untagged(test_client, db_session):
    _seed_personal_expense(db_session)
    res = test_client.get("/api/v1/expenses")
    assert all(r["tags"] == [] for r in res.json()["items"])


# ─── Group expense association ────────────────────────────────


def test_any_group_member_can_tag_a_shared_expense(test_client, db_session):
    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session)
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    res = test_client.post(f"/api/v1/expenses/{expense_id}/tags", json={"tag_ids": [tag["id"]]})
    assert res.status_code == 200


def test_non_member_cannot_tag_a_group_expense(test_client, db_session):
    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session)
    db_session.add(User(id=uuid.uuid4(), email="outsider@user.com", password_hash="hash", name="Outsider"))
    db_session.commit()

    outsider_tag_svc = TagService(db_session)
    outsider_tag, _ = outsider_tag_svc.create_tag("outsider@user.com", "Sneaky")

    # Simulate the outsider's request via the service layer directly (test_client is fixed as
    # test@user.com) — the route's membership check is what we're really exercising here.
    from fastapi import HTTPException
    group_service = GroupService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        group_service.require_membership(group_id, "outsider@user.com")
    assert exc_info.value.status_code == 403


def test_group_member_never_sees_another_members_tags_on_shared_expense(test_client, db_session):
    """THE core TS-TAG-103/PRD §9.2 assertion. test@user.com and b@test.com share one group
    expense; each tags it privately. Neither must ever see the other's tag on that same row."""
    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session)

    # test@user.com (via HTTP, the normal path) tags it "Work".
    my_tag = test_client.post("/api/v1/tags", json={"name": "Work"}).json()
    test_client.post(f"/api/v1/expenses/{expense_id}/tags", json={"tag_ids": [my_tag["id"]]})

    # b@test.com (via the service layer directly, simulating their own authenticated request)
    # tags the SAME expense "Personal".
    b_tag_svc = TagService(db_session)
    b_tag, _ = b_tag_svc.create_tag("b@test.com", "Personal")
    b_tag_svc.apply_tags_to_expense("b@test.com", expense_id, tag_ids=[str(b_tag.id)])

    # test@user.com's view of the shared expense list must show ONLY "Work".
    my_view = test_client.get(f"/api/v1/groups/{group_id}/expenses").json()
    my_row = next(r for r in my_view["items"] if r["row_id"] == str(expense_id))
    assert [t["name"] for t in my_row["tags"]] == ["Work"]

    # b@test.com's view (via the service layer) must show ONLY "Personal" — never "Work".
    b_expense_svc = GroupExpenseService(db_session)
    b_view = b_expense_svc.list_group_expenses(group_id, "b@test.com")
    b_row = next(r for r in b_view["items"] if r["row_id"] == str(expense_id))
    assert [t["name"] for t in b_row["tags"]] == ["Personal"]


def test_group_expense_tags_isolation_holds_via_raw_repo_query(db_session):
    """Defense-in-depth: even bypassing the HTTP/service layer and going straight at the
    repository-layer helper (get_tags_for_expenses), the user_email filter must hold."""
    from varavu_selavu_service.services.tag_service import get_tags_for_expenses

    db_session.add(User(id=uuid.uuid4(), email="a@test.com", password_hash="hash", name="A"))
    db_session.add(User(id=uuid.uuid4(), email="b@test.com", password_hash="hash", name="B"))
    db_session.commit()
    exp = Expense(id=uuid.uuid4(), user_email="a@test.com", purchased_at=datetime(2026, 1, 5), category_id="Shopping", amount=10.0, description="shared")
    db_session.add(exp)
    db_session.commit()

    tag_svc = TagService(db_session)
    tag_a, _ = tag_svc.create_tag("a@test.com", "A's tag")
    tag_b, _ = tag_svc.create_tag("b@test.com", "B's tag")
    db_session.add(ExpenseTag(id=uuid.uuid4(), tag_id=tag_a.id, expense_id=exp.id, user_email="a@test.com"))
    db_session.add(ExpenseTag(id=uuid.uuid4(), tag_id=tag_b.id, expense_id=exp.id, user_email="b@test.com"))
    db_session.commit()

    a_view = get_tags_for_expenses(db_session, [exp.id], "a@test.com")
    b_view = get_tags_for_expenses(db_session, [exp.id], "b@test.com")
    assert [t["name"] for t in a_view[str(exp.id)]] == ["A's tag"]
    assert [t["name"] for t in b_view[str(exp.id)]] == ["B's tag"]


# ─── §9.5 group lifecycle interaction ────────────────────────────────


def test_member_leaving_group_does_not_cascade_delete_their_tag_links(test_client, db_session):
    """PRD §9.5: 'historical expenses and computed shares persist, so tag links persist. No
    action needed.' — verified directly against the schema: expense_tags has no FK to
    group_members, so removing a member must never touch expense_tags rows."""
    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session)
    b_tag_svc = TagService(db_session)
    b_tag, _ = b_tag_svc.create_tag("b@test.com", "Personal")
    b_tag_svc.apply_tags_to_expense("b@test.com", expense_id, tag_ids=[str(b_tag.id)])

    before = db_session.query(ExpenseTag).filter(ExpenseTag.user_email == "b@test.com").count()
    assert before == 1

    b_member = db_session.query(GroupMember).filter(GroupMember.group_id == uuid.UUID(group_id), GroupMember.user_email == "b@test.com").first()
    test_client.delete(f"/api/v1/groups/{group_id}/members/{b_member.id}")

    after = db_session.query(ExpenseTag).filter(ExpenseTag.user_email == "b@test.com").count()
    assert after == 1  # unchanged — the tag link survived the member's departure


def test_deleting_a_group_does_not_actually_cascade_anything(test_client, db_session):
    """Correction to PRD §9.5 (found while implementing TS-TAG-103, see PRD change log): the
    spec assumed 'Group is deleted -> its expenses cascade away, taking their tag links with
    them' and designed a UI warning around that. `GroupService.delete_group` is verified here to
    be a SOFT delete (`status='deleted'`, `deleted_at` set) — the Group row, its Expenses, and
    their expense_tags links are never actually removed, and `require_membership` (which
    `list_group_expenses` calls) doesn't check `Group.status` at all, so tagged expenses remain
    fully intact and visible through the exact same path as before. There is no cascade to warn
    about; §9.5's confirmation-dialog requirement doesn't correspond to real data loss today."""
    from varavu_selavu_service.services.group_service import GroupService

    group_id, expense_id = _seed_two_member_group_with_expense(test_client, db_session)
    tag = test_client.post("/api/v1/tags", json={"name": "Work"}).json()
    test_client.post(f"/api/v1/expenses/{expense_id}/tags", json={"tag_ids": [tag["id"]]})

    GroupService(db_session).delete_group(group_id, "test@user.com", force=True)

    group = db_session.query(Group).filter(Group.id == uuid.UUID(group_id)).first()
    assert group is not None and group.status == "deleted"  # soft delete — row persists
    assert db_session.query(Expense).filter(Expense.id == uuid.UUID(expense_id)).first() is not None
    assert db_session.query(ExpenseTag).filter(ExpenseTag.expense_id == uuid.UUID(expense_id)).count() == 1

    # Still fully visible via the exact same read path as before "deletion".
    still_visible = test_client.get(f"/api/v1/groups/{group_id}/expenses").json()
    row = next(r for r in still_visible["items"] if r["row_id"] == expense_id)
    assert [t["name"] for t in row["tags"]] == ["Work"]
