"""Portable MCP contracts. PostgreSQL races live in test_mcp_pg.py."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid
import pytest
from pydantic import ValidationError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from varavu_selavu_service.db.models import User, Expense, ExpenseItem
from varavu_selavu_service.db.mcp_models import (
    MCPGlobal,
    MCPConnection,
    OAuthClient,
    MCPOperation,
    MCPRateCounter,
)
from varavu_selavu_service.mcp.security import (
    Principal,
    utcnow,
    MCPError,
    authenticate,
    mint_access,
    revoke_connections,
)
from varavu_selavu_service.mcp.schemas import (
    VerifyExpense,
    ListExpenses,
    GetExpense,
    SummaryInput,
)
from varavu_selavu_service.mcp.operations import (
    verify,
    decide,
    save,
    get_operation,
    output,
)
from varavu_selavu_service.mcp import reads
from varavu_selavu_service.services.category_catalog import CATALOG


@pytest.fixture
def mcp(db_session, monkeypatch):
    key = (
        ec.generate_private_key(ec.SECP256R1())
        .private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        .decode()
    )
    monkeypatch.setenv("MCP_ENABLED", "true")
    monkeypatch.setenv("MCP_WRITES_ENABLED", "true")
    monkeypatch.setenv("MCP_TOKEN_SIGNING_KEY", key)
    db = db_session
    user = User(
        email="mcp@example.com", name="Tester", password_hash="!", email_verified=True
    )
    db.add(user)
    db.add(
        OAuthClient(
            client_id="test-client",
            client_name="Test assistant",
            redirect_uris=["https://client.example/callback"],
        )
    )
    db.add(MCPGlobal(id=1, disabled=False, writes_disabled=False))
    db.flush()
    conn = MCPConnection(
        user_email=user.email,
        client_id="test-client",
        client_name="Test assistant",
        scopes=["categories:read", "expenses:read", "expenses:create"],
        expires_at=utcnow() + timedelta(days=90),
    )
    db.add(conn)
    db.commit()
    principal = Principal(
        user.email, conn.id, conn.client_id, frozenset(conn.scopes), 0
    )
    return db, principal, conn


# A fixed old date would fall outside the one-year window the schema now enforces.
DRAFT_DATE = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()


def draft(key="draft-key-00000001", **kw):
    return VerifyExpense.model_validate(
        {
            "kind": "simple",
            "idempotency_key": key,
            "date": DRAFT_DATE,
            "description": "Lunch",
            "amount": "12.34",
            "category_id": next(k for k, v in CATALOG.items() if v[1] == "Dining out"),
            **kw,
        }
    )


def approved(db, p, key="draft-key-00000001", **kw):
    result = verify(db, p, draft(key, **kw))
    db.commit()
    decide(
        db,
        p.user_email,
        result["operation_id"],
        result["approval_revision"],
        True,
        True,
        str(uuid.uuid4()),
    )
    db.commit()
    return result["operation_id"]


def test_verify_approval_save_replay(mcp):
    db, p, c = mcp
    result = verify(db, p, draft())
    db.commit()
    assert db.query(Expense).count() == 0
    with pytest.raises(MCPError, match="approval_required"):
        save(db, p, result["operation_id"])
    db.rollback()
    decide(db, p.user_email, result["operation_id"], 1, True, False, str(uuid.uuid4()))
    db.commit()
    assert db.query(Expense).count() == 0
    saved = save(db, p, result["operation_id"])
    db.commit()
    assert saved["status"] == "committed"
    assert db.query(Expense).one().amount == Decimal("12.34")
    assert save(db, p, result["operation_id"])["replayed"] is True
    assert db.query(Expense).count() == 1
    assert (
        db.query(MCPRateCounter)
        .filter_by(bucket="creates", subject="connection:" + c.id)
        .one()
        .count
        == 1
    )


@pytest.mark.parametrize(
    "value", [12.34, 12, True, "1e3", "12.345", "-1.00", "NaN", "Infinity"]
)
def test_decimal_strings_only(value):
    with pytest.raises(ValidationError):
        draft(amount=value)


def test_immutable_key_and_new_duplicate_reapproval(mcp):
    db, p, c = mcp
    first = approved(db, p)
    second = approved(db, p, "draft-key-00000002")
    with pytest.raises(MCPError, match="idempotency_key_reused"):
        verify(db, p, draft(amount="20.00"))
    db.rollback()
    save(db, p, first)
    db.commit()
    result = save(db, p, second)
    db.commit()
    assert result["status"] == "pending_approval" and result["approval_revision"] == 2
    assert db.query(Expense).count() == 1
    decide(db, p.user_email, second, 2, True, True, str(uuid.uuid4()))
    db.commit()
    save(db, p, second)
    db.commit()
    assert db.query(Expense).count() == 2


def test_revocation_and_separate_token_audience(mcp):
    db, p, c = mcp
    token = mint_access(c)
    assert authenticate(db, token) == p
    from varavu_selavu_service.auth.security import create_access_token

    with pytest.raises(MCPError):
        authenticate(db, create_access_token({"sub": p.user_email}))
    oid = approved(db, p)
    revoke_connections(db, p.user_email, "logout")
    db.commit()
    with pytest.raises(MCPError):
        authenticate(db, token)
    with pytest.raises(MCPError):
        save(db, p, oid)
    assert db.query(Expense).count() == 0


def test_failed_write_rolls_back_everything(mcp, monkeypatch):
    db, p, c = mcp
    oid = approved(db, p)
    from varavu_selavu_service.services.category_memory_service import (
        CategoryMemoryService,
    )

    def fail(*a, **k):
        raise RuntimeError("injected failure after header")

    monkeypatch.setattr(CategoryMemoryService, "record", fail)
    with pytest.raises(RuntimeError):
        save(db, p, oid)
    db.rollback()
    assert db.query(Expense).count() == 0
    assert get_operation(db, p.user_email, oid).status == "approved"
    assert db.query(MCPRateCounter).filter_by(bucket="creates").count() == 0


def test_itemized_historical_receipt(mcp):
    db, p, c = mcp
    value = draft(
        kind="itemized",
        amount=None,
        total="2.50",
        merchant="Farm",
        items=[
            {
                "name": "Apples",
                "quantity": "1.250",
                "unit_price": "2.00",
                "line_total": "2.50",
            }
        ],
    )
    r = verify(db, p, value)
    db.commit()
    decide(db, p.user_email, r["operation_id"], 1, True, True, str(uuid.uuid4()))
    db.commit()
    save(db, p, r["operation_id"])
    db.commit()
    assert db.query(ExpenseItem).one().quantity == Decimal("1.250")
    exp = db.query(Expense).one()
    detail = reads.get_expense(db, p, GetExpense(expense_id=str(exp.id)))
    assert len(detail["items"]) == 1 and detail["source"] == "mcp"


def test_receipt_discount_is_folded_into_lines_at_verify(mcp):
    # TS-FIX-102: the approval preview shows the paid-price lines that will be saved.
    db, p, c = mcp
    value = draft(
        kind="itemized", amount=None, total="27.00", merchant="Shop", discount="3.00",
        items=[{"name": "A", "line_total": "10.00"}, {"name": "B", "line_total": "20.00"}],
    )
    r = verify(db, p, value)
    db.commit()
    op = get_operation(db, p.user_email, r["operation_id"])
    assert op.payload["discount"] == "0.00"
    assert [(i["line_total"], i["discount"], i["original_price"]) for i in op.payload["items"]] == [
        ("9.00", "1.00", "10.00"), ("18.00", "2.00", "20.00")]
    decide(db, p.user_email, r["operation_id"], 1, True, True, str(uuid.uuid4()))
    db.commit()
    save(db, p, r["operation_id"])
    db.commit()
    exp = db.query(Expense).one()
    assert exp.amount == Decimal("27.00") and exp.discount == Decimal("3.00")
    assert sorted(i.line_total for i in db.query(ExpenseItem)) == [Decimal("9.00"), Decimal("18.00")]


def test_unreconciled_receipts_are_always_refused(mcp):
    db, p, c = mcp
    mismatch = dict(kind="itemized", amount=None, total="30.00", merchant="Shop",
                    items=[{"name": "A", "line_total": "10.00"}])
    with pytest.raises(MCPError, match="totals_mismatch"):
        verify(db, p, draft(**mismatch))
    with pytest.raises(MCPError, match="validation_error"):
        verify(db, p, draft(**{**mismatch, "accept_unreconciled": True}))


def test_operation_verified_under_the_old_rule_is_refused_at_save(mcp):
    db, p, c = mcp
    r = verify(db, p, draft(kind="itemized", amount=None, total="10.00", merchant="Shop",
                            items=[{"name": "A", "line_total": "10.00"}]))
    db.commit()
    op = get_operation(db, p.user_email, r["operation_id"])
    # As stored before TS-FIX-102: pre-discount line plus a whole-receipt discount.
    op.payload = {**op.payload, "total": "8.00", "discount": "2.00"}
    db.commit()
    decide(db, p.user_email, r["operation_id"], op.revision, True, True, str(uuid.uuid4()))
    db.commit()
    with pytest.raises(MCPError, match="totals_mismatch"):
        save(db, p, r["operation_id"])
    db.rollback()
    assert db.query(Expense).count() == 0


def test_personal_currency_separation_and_foreign_not_found(mcp):
    db, p, c = mcp
    oid = approved(db, p)
    save(db, p, oid)
    db.commit()
    db.add(User(email="other@example.com", password_hash="!"))
    db.flush()
    other = Expense(
        user_email="other@example.com",
        category_id="Dining out",
        amount=Decimal("900.00"),
        currency="USD",
        purchased_at=utcnow(),
    )
    db.add(other)
    db.commit()
    with pytest.raises(MCPError, match="not_found"):
        reads.get_expense(db, p, GetExpense(expense_id=str(other.id)))
    result = reads.spending_summary(db, p, SummaryInput(year=int(DRAFT_DATE[:4])))
    assert result["currencies"][0]["total"] == "12.34"


def test_deleted_replay_never_recreates(mcp):
    db, p, c = mcp
    oid = approved(db, p)
    save(db, p, oid)
    db.commit()
    db.delete(db.query(Expense).one())
    db.commit()
    result = save(db, p, oid)
    db.commit()
    assert result["expense_unavailable"] and db.query(Expense).count() == 0


def test_logout_everywhere_and_payload_pruning(mcp):
    db, p, c = mcp
    oid = approved(db, p)
    save(db, p, oid)
    db.commit()
    from varavu_selavu_service.mcp.maintenance import cleanup

    row = db.get(MCPOperation, oid)
    row.terminal_at = utcnow() - timedelta(days=31)
    db.commit()
    cleanup(db)
    db.commit()
    db.expire_all()
    row = db.get(MCPOperation, oid)
    assert row.payload is None and row.result is None
    assert verify(db, p, draft())["status"] == "committed"
    from varavu_selavu_service.auth.service import AuthService

    AuthService(db).end_all_sessions(p.user_email, "logout")
    with pytest.raises(MCPError):
        save(db, p, oid)


def test_export_and_deletion_cover_mcp_state(mcp):
    db, p, c = mcp
    oid = approved(db, p)
    from varavu_selavu_service.services.account_export_service import (
        AccountExportService,
    )
    from varavu_selavu_service.db.mcp_models import (
        MCPAuditEvent,
        MCPRefreshToken,
        OAuthCode,
        OAuthRequest,
    )

    exported = AccountExportService(db).build(p.user_email)
    assert exported["assistant_connections"][0]["client_name"] == "Test assistant"
    assert exported["assistant_operations"][0]["id"] == oid
    assert "request_hash" not in str(exported)
    db.query(User).filter_by(email=p.user_email).delete()
    db.commit()
    for model in (MCPConnection, MCPOperation, MCPAuditEvent, MCPRateCounter):
        assert db.query(model).filter_by(user_email=p.user_email).count() == 0


def test_control_generation_and_expiry_require_new_approval(mcp):
    db, p, c = mcp
    oid = approved(db, p)
    db.get(MCPGlobal, 1).generation += 1
    db.commit()
    result = save(db, p, oid)
    db.commit()
    assert result["status"] == "pending_approval"
    assert db.query(Expense).count() == 0
    row = db.get(MCPOperation, oid)
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert output(db, get_operation(db, p.user_email, oid))["status"] == "expired"
    with pytest.raises(MCPError, match="operation_expired"):
        save(db, p, oid)


def test_same_normalized_money_reuses_draft(mcp):
    db, p, c = mcp
    first = verify(db, p, draft(amount="12.3"))
    db.commit()
    second = verify(db, p, draft(amount="12.30"))
    db.commit()
    assert second["operation_id"] == first["operation_id"] and second["replayed"]


def test_current_ownership_and_scope_on_status(mcp):
    db, p, c = mcp
    oid = approved(db, p)
    with pytest.raises(MCPError, match="not_found"):
        get_operation(db, "other@example.com", oid)
    c.scopes = ["categories:read"]
    db.commit()
    with pytest.raises(MCPError, match="insufficient_scope"):
        save(db, p, oid)


def test_category_ambiguity_and_string_schema():
    from varavu_selavu_service.services.category_catalog import (
        COUNTS,
        filter_names,
        stored_category,
    )

    ambiguous = next(k for k, v in CATALOG.items() if COUNTS[v[1]] > 1)
    with pytest.raises(ValueError, match="ambiguous_category_filter"):
        filter_names(ambiguous)
    assert stored_category(CATALOG[ambiguous][1])["category_id"] is None
    variants = VerifyExpense.model_json_schema()["properties"]["amount"]["anyOf"]
    assert {v["type"] for v in variants} == {"string", "null"}


def test_parser_inputs_cannot_coerce_text_or_dates():
    with pytest.raises(ValidationError):
        draft(description=123)
    with pytest.raises(ValidationError):
        draft(date="2026-02-30")
    with pytest.raises(ValidationError):
        draft(user_email="victim@example.com")
    with pytest.raises(ValidationError):
        draft(approved=True)


def test_catalog_manifest_is_stable():
    import json
    from pathlib import Path

    expected = json.loads(
        (Path(__file__).parent / "fixtures/mcp_category_catalog.json").read_text()
    )
    assert expected == {k: list(v) for k, v in CATALOG.items()}


def test_logout_all_has_no_partial_commit(mcp, monkeypatch):
    from varavu_selavu_service.auth.service import AuthService

    db, p, c = mcp

    def fail(*args, **kwargs):
        raise RuntimeError("injected logout failure")

    monkeypatch.setattr(AuthService, "end_access_tokens", fail)
    with pytest.raises(RuntimeError):
        AuthService(db).end_all_sessions(p.user_email, "logout")
    db.rollback()
    assert db.get(MCPConnection, c.id).status == "active"


def test_retention_advances_beyond_first_pruned_batch(mcp):
    from varavu_selavu_service.mcp.maintenance import cleanup

    db, p, c = mcp
    ids = []
    for key in ("retention-draft-0001", "retention-draft-0002"):
        result = verify(db, p, draft(key))
        db.commit()
        row = db.get(MCPOperation, result["operation_id"])
        row.status = "rejected"
        row.terminal_at = utcnow() - timedelta(days=31)
        db.commit()
        ids.append(row.id)
    cleanup(db, limit=1)
    db.commit()
    cleanup(db, limit=1)
    db.commit()
    db.expire_all()
    assert all(db.get(MCPOperation, oid).payload is None for oid in ids)


def test_date_window_rejects_future_and_over_a_year_old():
    with pytest.raises(ValidationError):
        draft(date=(datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat())
    with pytest.raises(ValidationError):
        draft(date=(datetime.now(timezone.utc) - timedelta(days=400)).date().isoformat())


def test_receipt_subtotal_before_the_discount_still_matches(mcp):
    # A printed subtotal is before the whole-receipt discount; once folded into the lines it moves with them.
    db, p, c = mcp
    r = verify(db, p, draft(kind="itemized", amount=None, total="27.00", merchant="Shop", subtotal="30.00", discount="3.00",
                            items=[{"name": "A", "line_total": "10.00"}, {"name": "B", "line_total": "20.00"}]))
    db.commit()
    assert get_operation(db, p.user_email, r["operation_id"]).payload["subtotal"] == "27.00"


def test_a_discount_larger_than_the_lines_never_makes_the_subtotal_negative(mcp):
    # Security re-check SEC-4: only the discount the lines absorbed comes off the subtotal.
    db, p, c = mcp
    with pytest.raises(MCPError):
        verify(db, p, draft(kind="itemized", amount=None, total="1.00", merchant="Shop", subtotal="5.00", discount="9.00",
                            items=[{"name": "A", "line_total": "5.00"}]))
