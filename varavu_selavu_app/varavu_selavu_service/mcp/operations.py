"""Preparation and approval never insert financial records. Save is atomic."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
import uuid
from sqlalchemy import select
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import Expense
from varavu_selavu_service.db.mcp_models import MCPOperation, MCPConnection
from varavu_selavu_service.mcp.security import (
    MCPError,
    aware,
    digest,
    utcnow,
    execution_gate,
    grant,
)
from varavu_selavu_service.mcp.audit import audit
from varavu_selavu_service.mcp.rate_limit import reserve, user_subject, disclose
from varavu_selavu_service.mcp.reads import summary, owned
from varavu_selavu_service.services.personal_write_lock import duplicate_fingerprint
from varavu_selavu_service.services.expense_write_service import (
    ExpenseWriteService,
    reconcile_receipt_totals,
)
from varavu_selavu_service.services.category_catalog import resolve, COUNTS
from varavu_selavu_service.services.receipt_lines import LineError, distribute_cents, money, prepare_lines


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def duplicates(db, email, payload):
    amount = Decimal(
        payload["amount"] if payload["kind"] == "simple" else payload["total"]
    )
    day = date.fromisoformat(payload["date"])
    start = datetime.combine(
        day - timedelta(days=1) if day > date.min else day,
        datetime.min.time(),
        timezone.utc,
    )
    end = datetime.combine(day + timedelta(days=2), datetime.min.time(), timezone.utc)
    fingerprint = duplicate_fingerprint(
        payload["currency"], amount, payload.get("merchant"), payload["description"]
    )
    candidates = (
        db.query(Expense)
        .filter(
            Expense.user_email == email,
            Expense.group_id.is_(None),
            Expense.amount == amount,
            Expense.currency == payload["currency"],
            Expense.purchased_at >= start,
            Expense.purchased_at < end,
        )
        .order_by(Expense.id)
        .limit(501)
        .all()
    )
    if len(candidates) > 500:
        raise MCPError(
            "validation_error",
            hint="Too many possible duplicates; review in TrackSpense",
        )
    return [
        {
            "id": str(r.id),
            "date": r.purchased_at.date().isoformat(),
            "amount": f"{r.amount:.2f}",
            "currency": r.currency,
        }
        for r in candidates
        if duplicate_fingerprint(r.currency, r.amount, r.merchant_name, r.description)
        == fingerprint
    ]


def fold_receipt_discount(payload):
    """TS-FIX-102: a whole-receipt discount is divided across the lines by paid price (tracking only), so
    the approval preview shows exactly the lines that will be saved. Lines get original_price filled in."""
    if payload.get("kind") != "itemized":
        return payload
    items = payload.get("items", [])
    try:
        lines = prepare_lines([{**i, "line_total": i["line_total"], "discount": i.get("discount")} for i in items])
    except LineError as e:
        raise MCPError("validation_error", hint=str(e))
    extra = int(money(payload.get("discount")) * 100)
    absorbed = Decimal("0")
    if extra and lines:
        parts = distribute_cents(extra, [int(ln["line_total"] * 100) for ln in lines])
        for ln, part in zip(lines, parts):
            take = min(Decimal(part) / 100, ln["line_total"])
            ln["line_total"] -= take
            ln["discount"] += take
            absorbed += take
    for item, ln in zip(items, lines):
        item["line_total"] = f"{ln['line_total']:.2f}"
        item["discount"] = f"{ln['discount']:.2f}"
        item["original_price"] = f"{ln['line_total'] + ln['discount']:.2f}"
    if extra and payload.get("subtotal") is not None:
        # The supplied subtotal is the sum of lines before the whole-receipt discount; the lines now
        # carry it, so the subtotal does too.
        # Only what the lines actually absorbed (a discount larger than the lines can't push them below 0).
        payload["subtotal"] = f"{money(payload['subtotal']) - absorbed:.2f}"
    payload["discount"] = "0.00"
    return payload


def warning_list(payload):
    warnings = []
    if COUNTS[resolve(payload["category_id"])[1]] > 1:
        warnings.append(
            {
                "code": "category_ambiguous",
                "message": "The stored category cannot retain the main-category distinction.",
            }
        )
    if payload["kind"] == "itemized":
        if payload.get("accept_unreconciled"):
            raise MCPError(
                "validation_error",
                hint="accept_unreconciled is no longer supported: item prices plus tax and tip must match the total.",
            )
        if money(payload.get("discount")) != 0:
            # Only a payload verified before TS-FIX-102 still has one; it would be subtracted again.
            raise MCPError("totals_mismatch", hint="Verify this receipt again.")
        figures = reconcile_receipt_totals(
            payload["items"],
            payload["total"],
            payload["tax"],
            payload["tip"],
            payload["subtotal"],
        )
        if not figures["reconciled"]:
            raise MCPError("totals_mismatch", **figures)
        for n, item in enumerate(payload["items"], 1):
            if item["unit_price"] is not None and abs(
                Decimal(item["quantity"]) * Decimal(item["unit_price"])
                - Decimal(item["discount"])
                - Decimal(item["line_total"])
            ) > Decimal(".02"):
                warnings.append({"code": "item_arithmetic", "line": n})
    return warnings


def get_operation(db, email, operation_id, connection_id=None, lock=False):
    stmt = select(MCPOperation).where(
        MCPOperation.id == operation_id, MCPOperation.user_email == email
    )
    if connection_id:
        stmt = stmt.where(MCPOperation.connection_id == connection_id)
    row = db.execute(
        (stmt.with_for_update() if lock else stmt).execution_options(
            populate_existing=True
        )
    ).scalar_one_or_none()
    if row is None:
        raise MCPError("not_found")
    if (
        lock
        and row.status in ("pending_approval", "approved")
        and aware(row.expires_at) <= utcnow()
    ):
        row.status, row.terminal_at = "expired", row.expires_at
    return row


def output(db, operation, principal=None, replayed=False):
    # Reads report logical expiry without writing a stale snapshot over a concurrent save.
    status = operation.status
    if (
        status in ("pending_approval", "approved")
        and aware(operation.expires_at) <= utcnow()
    ):
        status = "expired"
    connection = db.get(MCPConnection, operation.connection_id)
    result = {
        "connection_name": connection.client_name if connection else "Assistant",
        "operation_id": operation.id,
        "status": status,
        "approval_revision": operation.revision,
        "replayed": replayed,
        "expires_at": aware(operation.expires_at).isoformat(),
        "decided_at": (
            aware(operation.decided_at).isoformat() if operation.decided_at else None
        ),
    }
    if status in ("pending_approval", "approved"):
        result.update(
            preview=operation.payload,
            warnings=operation.warnings,
            possible_duplicates=operation.duplicates,
            approval_url=f"{Settings().PUBLIC_APP_URL.rstrip('/')}/ai/approve/{operation.id}",
        )
        if principal:
            disclose(db, principal, len(operation.duplicates))
    elif status == "committed":
        result["expense_id"] = operation.expense_id
        try:
            expense = owned(db, operation.user_email, operation.expense_id)
        except MCPError:
            result.update(expense=None, expense_unavailable=True)
        else:
            if principal is None:
                result["expense"] = summary(db, expense)
            else:
                try:
                    with db.begin_nested():
                        disclose(db, principal, 1)
                    result["expense"] = (
                        summary(db, expense)
                        if "expenses:read" in principal.scopes
                        else operation.result
                    )
                except MCPError:
                    result["detail_omitted"] = "read_budget_exhausted"
    return result


def verify(db, principal, data):
    execution_gate(db, principal, "expenses:create", write=True)
    payload = data.model_dump(mode="json", exclude={"idempotency_key"})
    for field in ("amount", "total", "subtotal", "tax", "tip", "discount"):
        if payload.get(field) is not None:
            payload[field] = f"{Decimal(payload[field]):.2f}"
    for item in payload.get("items", []):
        item["quantity"] = format(Decimal(item["quantity"]).normalize(), "f")
        for field in ("unit_price", "line_total", "discount"):
            if item.get(field) is not None:
                item[field] = f"{Decimal(item[field]):.2f}"
    request_hash = digest(canonical(payload))
    existing = (
        db.query(MCPOperation)
        .filter(
            MCPOperation.connection_id == principal.connection_id,
            MCPOperation.idempotency_key == data.idempotency_key,
        )
        .first()
    )
    if existing:
        if existing.request_hash != request_hash:
            raise MCPError("idempotency_key_reused")
        existing = get_operation(
            db, principal.user_email, existing.id, principal.connection_id
        )
        return output(db, existing, principal, replayed=True)
    payload = fold_receipt_discount(payload)
    warnings = warning_list(payload)
    matches = duplicates(db, principal.user_email, payload)
    if matches:
        warnings.append({"code": "possible_duplicate"})
    if (
        len(
            canonical(
                {"preview": payload, "duplicates": matches, "warnings": warnings}
            ).encode()
        )
        > 120000
    ):
        raise MCPError("validation_error", hint="Receipt preview too large")
    if (
        db.query(MCPOperation)
        .filter(
            MCPOperation.user_email == principal.user_email,
            MCPOperation.status.in_(["pending_approval", "approved"]),
            MCPOperation.expires_at > utcnow(),
        )
        .count()
        >= 100
    ):
        raise MCPError("daily_limit_reached", bucket="open_drafts")
    reserve(
        db,
        "connection:" + principal.connection_id,
        "drafts",
        60,
        10,
        user_email=principal.user_email,
    )
    reserve(
        db,
        user_subject(principal.user_email),
        "drafts",
        86400,
        100,
        user_email=principal.user_email,
    )
    row = MCPOperation(
        user_email=principal.user_email,
        connection_id=principal.connection_id,
        idempotency_key=data.idempotency_key,
        request_hash=request_hash,
        payload=payload,
        warnings=warnings,
        duplicates=matches,
        expires_at=utcnow() + timedelta(hours=Settings().MCP_APPROVAL_HOURS),
    )
    db.add(row)
    db.flush()
    audit(
        db,
        principal.user_email,
        "expense.verified",
        connection_id=principal.connection_id,
        operation_id=row.id,
    )
    return output(db, row, principal)


def decide(db, email, operation_id, revision, approve, acknowledged, session_id):
    initial = get_operation(db, email, operation_id)
    conn, global_state = grant(
        db,
        initial.connection_id,
        lock=True,
        write=approve,
        required="expenses:create" if approve else None,
    )
    row = get_operation(db, email, operation_id, lock=True)
    if (
        row.status
        not in (("pending_approval",) if approve else ("pending_approval", "approved"))
        or row.revision != revision
    ):
        raise MCPError(
            "operation_" + row.status
            if row.status in ("expired", "rejected")
            else "validation_error"
        )
    if approve and row.warnings and not acknowledged:
        raise MCPError("validation_error", field="acknowledge_warnings")
    row.status, row.decided_at, row.approved_session = (
        ("approved" if approve else "rejected"),
        utcnow(),
        session_id,
    )
    if approve:
        row.approved_hash = digest(canonical(row.payload))
        row.approved_revision = row.revision
        row.approved_global_generation = global_state.generation
        row.approved_connection_generation = conn.generation
    else:
        row.terminal_at = utcnow()
    audit(
        db,
        email,
        "approval.approved" if approve else "approval.rejected",
        connection_id=conn.id,
        operation_id=row.id,
    )
    return output(db, row)


def save(db, principal, operation_id):
    conn, global_state = execution_gate(db, principal, "expenses:create", write=True)
    row = get_operation(
        db, principal.user_email, operation_id, principal.connection_id, lock=True
    )
    if row.status == "committed":
        return output(db, row, principal, replayed=True)
    if row.status in ("expired", "rejected"):
        raise MCPError("operation_" + row.status)
    if row.status != "approved":
        raise MCPError("approval_required")
    if (
        row.approved_hash != digest(canonical(row.payload))
        or row.approved_revision != row.revision
        or row.approved_global_generation != global_state.generation
        or row.approved_connection_generation != conn.generation
    ):
        row.status, row.revision = "pending_approval", row.revision + 1
        return output(db, row, principal)
    matches = duplicates(db, principal.user_email, row.payload)
    reviewed = {canonical(d) for d in row.duplicates}
    if any(canonical(d) not in reviewed for d in matches):
        row.status, row.revision, row.duplicates = (
            "pending_approval",
            row.revision + 1,
            matches,
        )
        row.warnings = warning_list(row.payload) + [{"code": "possible_duplicate"}]
        audit(
            db,
            principal.user_email,
            "approval.renewal_required",
            connection_id=conn.id,
            operation_id=row.id,
        )
        return output(db, row, principal)
    reserve(db, "connection:" + conn.id, "creates", 60, 10, user_email=conn.user_email)
    reserve(
        db,
        user_subject(conn.user_email),
        "creates",
        86400,
        100,
        user_email=conn.user_email,
    )
    reserve(db, "global", "creates", 3600, 2000)
    if row.payload["kind"] == "itemized":
        reserve(
            db,
            user_subject(conn.user_email),
            "itemized",
            86400,
            30,
            user_email=conn.user_email,
        )
    # TS-FIX-102: the totals rule is re-checked at save, so an operation verified under the old rule
    # (whole-receipt discount subtracted) is refused rather than saved with a second discount.
    warning_list(row.payload)
    row.expense_id = ExpenseWriteService(db).from_verified(
        conn.user_email, row.payload, conn.id
    )
    row.expense_record_id = uuid.UUID(row.expense_id)
    row.status, row.terminal_at = "committed", utcnow()
    row.result = summary(db, owned(db, conn.user_email, row.expense_id))
    audit(
        db,
        conn.user_email,
        "expense.committed",
        connection_id=conn.id,
        operation_id=row.id,
    )
    db.flush()
    return output(db, row, principal)
