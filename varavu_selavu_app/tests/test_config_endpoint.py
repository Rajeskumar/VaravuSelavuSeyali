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


def test_config_reflects_groups_enabled_true(test_client):
    os.environ["GROUPS_ENABLED"] = "true"
    res = test_client.get("/api/v1/config")
    assert res.status_code == 200
    assert res.json() == {"groups_enabled": True}


def test_config_reflects_groups_enabled_false(test_client):
    os.environ["GROUPS_ENABLED"] = "false"
    res = test_client.get("/api/v1/config")
    assert res.status_code == 200
    assert res.json() == {"groups_enabled": False}
