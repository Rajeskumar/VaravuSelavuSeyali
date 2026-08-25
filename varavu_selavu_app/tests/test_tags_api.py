"""tests/test_tags_api.py — TS-TAG-102 Tag CRUD service & API."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from varavu_selavu_service.db.models import ExpenseTag, Tag, User
from varavu_selavu_service.services.tag_service import TagService


@pytest.fixture(autouse=True)
def _tags_enabled():
    old_val = os.environ.get("TAGS_ENABLED")
    os.environ["TAGS_ENABLED"] = "true"
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["TAGS_ENABLED"] = old_val
        else:
            os.environ.pop("TAGS_ENABLED", None)


def test_gate_returns_404_when_disabled(test_client, monkeypatch):
    monkeypatch.setenv("TAGS_ENABLED", "false")
    res = test_client.get("/api/v1/tags")
    assert res.status_code == 404


def test_create_tag(test_client, db_session):
    res = test_client.post("/api/v1/tags", json={"name": "Trip 1"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Trip 1"
    assert body["status"] == "Active"
    assert body["color"]  # auto-assigned
    assert body["usage_count"] == 0
    assert body["last_used_at"] is None


def test_create_tag_rejects_empty_name(test_client, db_session):
    res = test_client.post("/api/v1/tags", json={"name": "   "})
    assert res.status_code == 422


def test_create_tag_rejects_name_over_50_chars(test_client, db_session):
    res = test_client.post("/api/v1/tags", json={"name": "x" * 51})
    assert res.status_code == 422


def test_create_tag_with_explicit_color(test_client, db_session):
    res = test_client.post("/api/v1/tags", json={"name": "Gift", "color": "#123ABC"})
    assert res.status_code == 201
    assert res.json()["color"] == "#123ABC"


def test_create_tag_rejects_invalid_color(test_client, db_session):
    res = test_client.post("/api/v1/tags", json={"name": "Gift", "color": "not-a-color"})
    assert res.status_code == 422


def test_create_tag_exact_normalized_collision_returns_existing_with_200(test_client, db_session):
    first = test_client.post("/api/v1/tags", json={"name": "Trip 1"})
    assert first.status_code == 201
    first_id = first.json()["id"]

    second = test_client.post("/api/v1/tags", json={"name": "  TRIP  1 "})
    assert second.status_code == 200
    assert second.json()["id"] == first_id


def test_create_tag_punctuation_variant_is_a_distinct_tag(test_client, db_session):
    """The PRD's explicit v0.2.0 reversal — 'Trip 1' and 'Trip1' must never silently merge."""
    first = test_client.post("/api/v1/tags", json={"name": "Trip 1"})
    second = test_client.post("/api/v1/tags", json={"name": "Trip1"})
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


def test_create_tag_enforces_per_user_limit(test_client, db_session, monkeypatch):
    monkeypatch.setenv("TAG_MAX_PER_USER", "2")
    test_client.post("/api/v1/tags", json={"name": "One"})
    test_client.post("/api/v1/tags", json={"name": "Two"})
    res = test_client.post("/api/v1/tags", json={"name": "Three"})
    assert res.status_code == 422


def test_two_users_can_have_tags_with_the_same_name(test_client, db_session):
    """Tags are private per-user (PRD §5.1) — the uniqueness constraint is scoped to
    (user_email, normalized_name), not global."""
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()

    mine = test_client.post("/api/v1/tags", json={"name": "Trip 1"})
    assert mine.status_code == 201

    other_svc = TagService(db_session)
    other_tag, created = other_svc.create_tag("other@user.com", "Trip 1")
    assert created is True
    assert str(other_tag.id) != mine.json()["id"]


def test_list_tags_excludes_archived_by_default(test_client, db_session):
    active = test_client.post("/api/v1/tags", json={"name": "Active One"}).json()
    archived = test_client.post("/api/v1/tags", json={"name": "Old Trip"}).json()
    test_client.put(f"/api/v1/tags/{archived['id']}", json={"status": "Archived"})

    res = test_client.get("/api/v1/tags")
    names = [t["name"] for t in res.json()]
    assert "Active One" in names
    assert "Old Trip" not in names


def test_list_tags_status_all_includes_archived(test_client, db_session):
    archived = test_client.post("/api/v1/tags", json={"name": "Old Trip"}).json()
    test_client.put(f"/api/v1/tags/{archived['id']}", json={"status": "Archived"})

    res = test_client.get("/api/v1/tags", params={"status": "all"})
    names = [t["name"] for t in res.json()]
    assert "Old Trip" in names


def test_list_tags_q_filters_by_name_substring(test_client, db_session):
    test_client.post("/api/v1/tags", json={"name": "Kitchen reno"})
    test_client.post("/api/v1/tags", json={"name": "Trip 1"})

    res = test_client.get("/api/v1/tags", params={"q": "kitchen"})
    names = [t["name"] for t in res.json()]
    assert names == ["Kitchen reno"]


def test_list_tags_ranked_by_most_recently_used_then_most_used(test_client, db_session):
    """PRD §10.1/§8.1: ranking is derived from expense_tags, most-recently-used first."""
    tag_a = test_client.post("/api/v1/tags", json={"name": "A"}).json()
    tag_b = test_client.post("/api/v1/tags", json={"name": "B"}).json()

    from varavu_selavu_service.db.models import Expense
    exp = Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Shopping", amount=10.0, description="x")
    db_session.add(exp)
    db_session.commit()

    # B used more recently than A would be (A never used at all).
    db_session.add(ExpenseTag(id=uuid.uuid4(), tag_id=uuid.UUID(tag_b["id"]), expense_id=exp.id, user_email="test@user.com"))
    db_session.commit()

    res = test_client.get("/api/v1/tags")
    names = [t["name"] for t in res.json()]
    assert names[0] == "B"  # used tag ranks above never-used tag


def test_rename_tag(test_client, db_session):
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    res = test_client.put(f"/api/v1/tags/{tag['id']}", json={"name": "Trip 2"})
    assert res.status_code == 200
    assert res.json()["name"] == "Trip 2"


def test_rename_tag_rejects_collision_with_another_tag(test_client, db_session):
    test_client.post("/api/v1/tags", json={"name": "Trip 1"})
    other = test_client.post("/api/v1/tags", json={"name": "Trip 2"}).json()

    res = test_client.put(f"/api/v1/tags/{other['id']}", json={"name": "Trip 1"})
    assert res.status_code == 409


def test_rename_tag_allows_no_op_case_change_on_self(test_client, db_session):
    """Renaming a tag to a variant that normalizes to its OWN current normalized_name must not
    be treated as a collision with itself."""
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    res = test_client.put(f"/api/v1/tags/{tag['id']}", json={"name": "TRIP 1"})
    assert res.status_code == 200
    assert res.json()["name"] == "TRIP 1"


def test_recolor_tag(test_client, db_session):
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    res = test_client.put(f"/api/v1/tags/{tag['id']}", json={"color": "#ABCDEF"})
    assert res.status_code == 200
    assert res.json()["color"] == "#ABCDEF"


def test_archive_and_unarchive_tag(test_client, db_session):
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    archived = test_client.put(f"/api/v1/tags/{tag['id']}", json={"status": "Archived"})
    assert archived.json()["status"] == "Archived"

    unarchived = test_client.put(f"/api/v1/tags/{tag['id']}", json={"status": "Active"})
    assert unarchived.json()["status"] == "Active"


def test_update_rejects_invalid_status(test_client, db_session):
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    res = test_client.put(f"/api/v1/tags/{tag['id']}", json={"status": "Deleted"})
    assert res.status_code == 422


def test_update_nonexistent_tag_404s(test_client, db_session):
    res = test_client.put(f"/api/v1/tags/{uuid.uuid4()}", json={"name": "X"})
    assert res.status_code == 404


def test_cannot_update_another_users_tag(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()
    other_svc = TagService(db_session)
    other_tag, _ = other_svc.create_tag("other@user.com", "Secret Trip")

    res = test_client.put(f"/api/v1/tags/{other_tag.id}", json={"name": "Hacked"})
    assert res.status_code == 404


def test_delete_tag(test_client, db_session):
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()
    res = test_client.delete(f"/api/v1/tags/{tag['id']}")
    assert res.status_code == 200
    assert res.json()["success"] is True

    assert db_session.query(Tag).filter(Tag.id == uuid.UUID(tag["id"])).first() is None


def test_delete_tag_cascades_expense_tag_links(test_client, db_session):
    tag = test_client.post("/api/v1/tags", json={"name": "Trip 1"}).json()

    from varavu_selavu_service.db.models import Expense
    exp = Expense(id=uuid.uuid4(), user_email="test@user.com", purchased_at=datetime(2026, 1, 5), category_id="Shopping", amount=10.0, description="x")
    db_session.add(exp)
    db_session.commit()
    db_session.add(ExpenseTag(id=uuid.uuid4(), tag_id=uuid.UUID(tag["id"]), expense_id=exp.id, user_email="test@user.com"))
    db_session.commit()

    test_client.delete(f"/api/v1/tags/{tag['id']}")
    assert db_session.query(ExpenseTag).filter(ExpenseTag.tag_id == uuid.UUID(tag["id"])).count() == 0


def test_cannot_delete_another_users_tag(test_client, db_session):
    db_session.add(User(id=uuid.uuid4(), email="other@user.com", password_hash="hash", name="Other"))
    db_session.commit()
    other_svc = TagService(db_session)
    other_tag, _ = other_svc.create_tag("other@user.com", "Secret Trip")

    res = test_client.delete(f"/api/v1/tags/{other_tag.id}")
    assert res.status_code == 404
    assert db_session.query(Tag).filter(Tag.id == other_tag.id).first() is not None
