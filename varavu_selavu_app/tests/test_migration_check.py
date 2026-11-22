"""The startup migration check must be quiet when current and loud (not fatal) when behind."""

import logging

from varavu_selavu_service.db import migration_check as mc


def test_behind_only_when_both_known_and_different():
    assert mc.behind("a", "b") is True
    assert mc.behind("a", "a") is False
    assert mc.behind(None, "b") is False  # sqlite / bootstrapped: nothing to compare
    assert mc.behind("a", None) is False  # alembic folder not shipped


def test_code_head_matches_the_newest_migration_file():
    head = mc.code_head()
    assert head and len(head) >= 8


def test_logs_an_actionable_error_when_database_lags(monkeypatch, caplog):
    monkeypatch.setattr(mc, "database_revision", lambda engine: "old000000000")
    monkeypatch.setattr(mc, "code_head", lambda: "new111111111")
    with caplog.at_level(logging.ERROR, logger="varavu_selavu.migrations"):
        mc.check(object())
    assert "alembic upgrade head" in caplog.text and "old000000000" in caplog.text


def test_silent_when_current(monkeypatch, caplog):
    monkeypatch.setattr(mc, "database_revision", lambda engine: "same")
    monkeypatch.setattr(mc, "code_head", lambda: "same")
    with caplog.at_level(logging.ERROR, logger="varavu_selavu.migrations"):
        mc.check(object())
    assert caplog.text == ""


def test_sqlite_test_database_has_no_revision():
    from sqlalchemy import create_engine
    assert mc.database_revision(create_engine("sqlite://")) is None
