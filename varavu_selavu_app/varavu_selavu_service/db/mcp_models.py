"""OAuth grants and approval records; never store raw client credentials."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    DateTime,
    JSON,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from varavu_selavu_service.db.session import Base


def now():
    return datetime.now(timezone.utc)


def identifier():
    return str(uuid.uuid4())


def user_fk():
    return Column(
        String(255),
        ForeignKey("trackspense.users.email", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )


class OAuthClient(Base):
    __tablename__ = "oauth_clients"
    __table_args__ = {"schema": "trackspense"}
    client_id = Column(String(512), primary_key=True)
    client_name = Column(String(100), nullable=False)
    redirect_uris = Column(JSON, nullable=False)
    registration_type = Column(String(20), nullable=False, default="preregistered")
    verified = Column(Boolean, nullable=False, default=False)
    blocked = Column(Boolean, nullable=False, default=False)
    metadata_expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class OAuthRequest(Base):
    __tablename__ = "oauth_authorization_requests"
    __table_args__ = {"schema": "trackspense"}
    id = Column(String(64), primary_key=True)
    client_id = Column(
        String(512), ForeignKey("trackspense.oauth_clients.client_id"), nullable=False
    )
    redirect_uri = Column(String(2048), nullable=False)
    scopes = Column(JSON, nullable=False)
    code_challenge = Column(String(128), nullable=False)
    state = Column(String(2048), nullable=False)
    resource = Column(String(512), nullable=False)
    user_email = Column(
        String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE")
    )
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at = Column(DateTime(timezone=True))
    bound_session = Column(String(36))


class MCPConnection(Base):
    __tablename__ = "mcp_connections"
    __table_args__ = {"schema": "trackspense"}
    id = Column(String(36), primary_key=True, default=identifier)
    user_email = user_fk()
    client_id = Column(
        String(512), ForeignKey("trackspense.oauth_clients.client_id"), nullable=False
    )
    client_name = Column(String(100), nullable=False)
    scopes = Column(JSON, nullable=False)
    status = Column(String(20), nullable=False, default="active")
    writes_enabled = Column(Boolean, nullable=False, default=True)
    generation = Column(Integer, nullable=False, default=0)
    consent_version = Column(String(20), nullable=False, default="2026-11-21")
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    revoked_reason = Column(String(40))
    last_used_at = Column(DateTime(timezone=True))


class OAuthCode(Base):
    __tablename__ = "oauth_authorization_codes"
    __table_args__ = {"schema": "trackspense"}
    code_hash = Column(String(64), primary_key=True)
    connection_id = Column(
        String(36),
        ForeignKey("trackspense.mcp_connections.id", ondelete="CASCADE"),
        nullable=False,
    )
    redirect_uri = Column(String(2048), nullable=False)
    code_challenge = Column(String(128), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True))


class MCPRefreshToken(Base):
    __tablename__ = "mcp_refresh_tokens"
    __table_args__ = {"schema": "trackspense"}
    token_hash = Column(String(64), primary_key=True)
    connection_id = Column(
        String(36),
        ForeignKey("trackspense.mcp_connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    family_id = Column(String(36), nullable=False, index=True)
    issued_at = Column(DateTime(timezone=True), nullable=False, default=now)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    absolute_expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True))
    revoked_at = Column(DateTime(timezone=True))
    replaced_by = Column(String(64))


class MCPUserPolicy(Base):
    __tablename__ = "mcp_user_policy"
    __table_args__ = {"schema": "trackspense"}
    user_email = Column(
        String(255),
        ForeignKey("trackspense.users.email", ondelete="CASCADE"),
        primary_key=True,
    )
    suspended = Column(Boolean, nullable=False, default=False)


class MCPOperation(Base):
    __tablename__ = "mcp_operations"
    __table_args__ = (
        UniqueConstraint(
            "connection_id", "idempotency_key", name="uq_mcp_operation_key"
        ),
        Index("ix_mcp_operation_owner_status", "user_email", "status", "created_at"),
        {"schema": "trackspense"},
    )
    id = Column(String(40), primary_key=True, default=lambda: "op_" + uuid.uuid4().hex)
    user_email = user_fk()
    connection_id = Column(
        String(36),
        ForeignKey("trackspense.mcp_connections.id", ondelete="CASCADE"),
        nullable=False,
    )
    idempotency_key = Column(String(128), nullable=False)
    request_hash = Column(String(64), nullable=False)
    canonicalization_version = Column(Integer, nullable=False, default=1)
    payload = Column(JSON(none_as_null=True))
    status = Column(String(20), nullable=False, default="pending_approval")
    revision = Column(Integer, nullable=False, default=1)
    warnings = Column(JSON, nullable=False, default=list)
    duplicates = Column(JSON, nullable=False, default=list)
    approved_hash = Column(String(64))
    approved_revision = Column(Integer)
    approved_global_generation = Column(Integer)
    approved_connection_generation = Column(Integer)
    approved_session = Column(String(36))
    decided_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    expense_record_id = Column(
        UUID(as_uuid=True), ForeignKey("trackspense.expenses.id", ondelete="SET NULL")
    )
    pruned_at = Column(DateTime(timezone=True))
    expense_id = Column(
        String(36)
    )  # retained non-authoritative identity after expense deletion
    result = Column(JSON(none_as_null=True))
    terminal_at = Column(DateTime(timezone=True), index=True)


class MCPRateCounter(Base):
    __tablename__ = "mcp_rate_counters"
    __table_args__ = {"schema": "trackspense"}
    subject = Column(String(600), primary_key=True)
    bucket = Column(String(40), primary_key=True)
    window_start = Column(Integer, primary_key=True, index=True)
    user_email = Column(
        String(255),
        ForeignKey("trackspense.users.email", ondelete="CASCADE"),
        index=True,
    )
    count = Column(Integer, nullable=False)


class MCPAuditEvent(Base):
    __tablename__ = "mcp_audit_events"
    __table_args__ = (
        Index("ix_mcp_audit_owner_time", "user_email", "created_at"),
        {"schema": "trackspense"},
    )
    id = Column(String(36), primary_key=True, default=identifier)
    user_email = Column(
        String(255),
        ForeignKey("trackspense.users.email", ondelete="CASCADE"),
        index=True,
    )
    client_id = Column(String(512))
    connection_id = Column(String(36))
    operation_id = Column(String(40))
    event = Column(String(80), nullable=False)
    outcome = Column(String(80), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class MCPGlobal(Base):
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=now, onupdate=now
    )
    __tablename__ = "mcp_global"
    __table_args__ = {"schema": "trackspense"}
    id = Column(Integer, primary_key=True, default=1)
    disabled = Column(Boolean, nullable=False, default=False)
    writes_disabled = Column(Boolean, nullable=False, default=True)
    generation = Column(Integer, nullable=False, default=0)
