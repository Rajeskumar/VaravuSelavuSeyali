from varavu_selavu_service.db.mcp_models import MCPAuditEvent


def audit(
    db,
    email,
    event,
    outcome="ok",
    connection_id=None,
    operation_id=None,
    client_id=None,
):
    db.add(
        MCPAuditEvent(
            user_email=email,
            client_id=client_id,
            event=event,
            outcome=outcome,
            connection_id=connection_id,
            operation_id=operation_id,
        )
    )


def denial(db, principal, name, code):
    """A failed financial transaction is rolled back before recording its redacted outcome."""
    try:
        audit(
            db,
            principal.user_email,
            "tool." + name,
            outcome=code,
            connection_id=principal.connection_id,
            client_id=principal.client_id,
        )
        db.commit()
    except Exception:
        db.rollback()  # deletion or an unavailable database must not change the original error
