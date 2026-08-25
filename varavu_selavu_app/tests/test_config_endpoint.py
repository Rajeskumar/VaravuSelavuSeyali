"""tests/test_config_endpoint.py — TS-GRP-111 client-visible flag surface."""
import os

import pytest


@pytest.fixture(autouse=True)
def _restore_flag():
    old_val = os.environ.get("GROUPS_ENABLED")
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["GROUPS_ENABLED"] = old_val
        else:
            os.environ.pop("GROUPS_ENABLED", None)


@pytest.fixture(autouse=True)
def _pin_card_coach_flag():
    # Pinned to a known value for every test in this file (same reason GROUPS_ENABLED/
    # ENTITY_RESOLUTION_ENABLED are) — a local dev .env can set CARD_COACH_ENABLED=true for
    # manual testing, and these exact-dict assertions must not depend on that ambient state.
    old_val = os.environ.get("CARD_COACH_ENABLED")
    os.environ["CARD_COACH_ENABLED"] = "false"
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["CARD_COACH_ENABLED"] = old_val
        else:
            os.environ.pop("CARD_COACH_ENABLED", None)


@pytest.fixture(autouse=True)
def _pin_tags_flag():
    # Same reason as _pin_card_coach_flag — a local dev .env can set TAGS_ENABLED=true.
    old_val = os.environ.get("TAGS_ENABLED")
    os.environ["TAGS_ENABLED"] = "false"
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["TAGS_ENABLED"] = old_val
        else:
            os.environ.pop("TAGS_ENABLED", None)


def test_config_reflects_groups_enabled_true(test_client):
    os.environ["GROUPS_ENABLED"] = "true"
    res = test_client.get("/api/v1/config")
    assert res.status_code == 200
    assert res.json() == {"groups_enabled": True, "entity_resolution_enabled": False, "budgets_enabled": True, "card_coach_enabled": False, "tags_enabled": False}


def test_config_reflects_groups_enabled_false(test_client):
    os.environ["GROUPS_ENABLED"] = "false"
    res = test_client.get("/api/v1/config")
    assert res.status_code == 200
    assert res.json() == {"groups_enabled": False, "entity_resolution_enabled": False, "budgets_enabled": True, "card_coach_enabled": False, "tags_enabled": False}


@pytest.fixture(autouse=True)
def _restore_entity_flag():
    old_val = os.environ.get("ENTITY_RESOLUTION_ENABLED")
    try:
        yield
    finally:
        if old_val is not None:
            os.environ["ENTITY_RESOLUTION_ENABLED"] = old_val
        else:
            os.environ.pop("ENTITY_RESOLUTION_ENABLED", None)


def test_config_reflects_entity_resolution_enabled_true(test_client):
    os.environ["GROUPS_ENABLED"] = "false"
    os.environ["ENTITY_RESOLUTION_ENABLED"] = "true"
    res = test_client.get("/api/v1/config")
    assert res.status_code == 200
    assert res.json() == {"groups_enabled": False, "entity_resolution_enabled": True, "budgets_enabled": True, "card_coach_enabled": False, "tags_enabled": False}
