"""Bounded retention sweeps; operation IDs and key reservations survive pruning."""

from datetime import timedelta
import time
from varavu_selavu_service.db.mcp_models import (
    MCPOperation,
    MCPAuditEvent,
    MCPRateCounter,
    OAuthRequest,
    OAuthCode,
    MCPRefreshToken,
)
from varavu_selavu_service.mcp.security import utcnow


def cleanup(db, limit=100):
    now = utcnow()
    count = 0
    expired = (
        db.query(MCPOperation)
        .filter(
            MCPOperation.status.in_(["pending_approval", "approved"]),
            MCPOperation.expires_at <= now,
        )
        .with_for_update(skip_locked=True)
        .limit(limit)
        .all()
    )
    for row in expired:
        row.status, row.terminal_at = "expired", row.expires_at
    for row in (
        db.query(MCPOperation)
        .filter(
            MCPOperation.terminal_at < now - timedelta(days=30),
            MCPOperation.payload.isnot(None),
        )
        .with_for_update(skip_locked=True)
        .limit(limit)
        .all()
    ):
        row.payload, row.result, row.warnings, row.duplicates = None, None, [], []
        row.pruned_at = now
        count += 1
    filters = [
        (MCPAuditEvent, MCPAuditEvent.created_at < now - timedelta(days=180)),
        (MCPRateCounter, MCPRateCounter.window_start < int(time.time()) - 172800),
        (OAuthRequest, OAuthRequest.expires_at < now - timedelta(days=1)),
        (OAuthCode, OAuthCode.expires_at < now - timedelta(days=1)),
        (MCPRefreshToken, MCPRefreshToken.absolute_expires_at < now),
    ]
    for model, condition in filters:
        for row in (
            db.query(model)
            .filter(condition)
            .with_for_update(skip_locked=True)
            .limit(limit)
            .all()
        ):
            db.delete(row)
            count += 1
    db.flush()
    return count + len(expired)
