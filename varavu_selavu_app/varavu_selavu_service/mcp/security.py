"""MCP credentials are never accepted as first-party user credentials."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import uuid
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import User
from varavu_selavu_service.db.mcp_models import (
    MCPConnection,
    MCPGlobal,
    MCPUserPolicy,
    OAuthClient,
    MCPOperation,
    MCPRefreshToken,
)
from varavu_selavu_service.services.personal_write_lock import lock_personal_user


class MCPError(Exception):
    def __init__(self, code, status=200, **details):
        self.code, self.status, self.details = code, status, details
        super().__init__(code)


def utcnow():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def signing_keys(settings=None):
    settings = settings or Settings()
    try:
        key = serialization.load_pem_private_key(
            settings.MCP_TOKEN_SIGNING_KEY.encode(), password=None
        )
        if (
            not isinstance(key, ec.EllipticCurvePrivateKey)
            or key.curve.name != "secp256r1"
        ):
            raise ValueError()
    except (ValueError, TypeError):
        raise RuntimeError(
            "MCP requires a separate P-256 private signing key"
        ) from None
    public = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return key, public, hashlib.sha256(public).hexdigest()[:16]


@dataclass(frozen=True)
class Principal:
    user_email: str
    connection_id: str
    client_id: str
    scopes: frozenset[str]
    generation: int


def mint_access(connection, scopes=None):
    settings = Settings()
    key, _, kid = signing_keys(settings)
    now = utcnow()
    return jwt.encode(
        {
            "iss": settings.MCP_ISSUER,
            "aud": settings.MCP_RESOURCE_URL,
            "sub": connection.id,
            "cid": connection.client_id,
            "scope": " ".join(connection.scopes if scopes is None else scopes),
            "generation": connection.generation,
            "iat": now,
            "exp": min(now + timedelta(minutes=10), aware(connection.expires_at)),
            "jti": str(uuid.uuid4()),
            "typ": "mcp+at",
        },
        key,
        algorithm="ES256",
        headers={"typ": "mcp+at", "kid": kid},
    )


def controls(db, lock=False):
    if not Settings().MCP_ENABLED:
        raise MCPError("access_suspended", 401)
    stmt = select(MCPGlobal).where(MCPGlobal.id == 1)
    if lock:
        stmt = stmt.with_for_update(read=True)
    row = db.execute(
        stmt.execution_options(populate_existing=True)
    ).scalar_one_or_none()
    if row is None or row.disabled:
        raise MCPError("access_suspended", 401)
    return row


def grant(db, connection_id, *, lock=False, write=False, required=None):
    global_state = controls(db, lock)
    initial = db.get(MCPConnection, connection_id)
    if initial is None:
        raise MCPError("invalid_token", 401)
    stmt = select(OAuthClient).where(OAuthClient.client_id == initial.client_id)
    client = db.execute(
        (stmt.with_for_update(read=True) if lock else stmt).execution_options(
            populate_existing=True
        )
    ).scalar_one_or_none()
    if client is None or client.blocked:
        raise MCPError("access_suspended", 401)
    if lock:
        lock_personal_user(db, initial.user_email)
    stmt = select(MCPConnection).where(MCPConnection.id == connection_id)
    conn = db.execute(
        (stmt.with_for_update() if lock else stmt).execution_options(
            populate_existing=True
        )
    ).scalar_one()
    policy = db.get(MCPUserPolicy, conn.user_email, populate_existing=True)
    if (
        conn.status != "active"
        or aware(conn.expires_at) <= utcnow()
        or db.query(User.id).filter(User.email == conn.user_email).first() is None
        or (policy and policy.suspended)
    ):
        raise MCPError("access_suspended", 401)
    if required and required not in conn.scopes:
        raise MCPError("insufficient_scope", 403, scope=required)
    if write and (
        not Settings().MCP_WRITES_ENABLED
        or global_state.writes_disabled
        or not conn.writes_enabled
    ):
        raise MCPError("writes_disabled")
    return conn, global_state


def decode_access(token):
    settings = Settings()
    _, public, kid = signing_keys(settings)
    try:
        header = jwt.get_unverified_header(token)
        keys = {kid: public}
        for pem in settings.MCP_PREVIOUS_VERIFY_KEYS:
            previous = serialization.load_pem_public_key(pem.encode())
            if (
                not isinstance(previous, ec.EllipticCurvePublicKey)
                or previous.curve.name != "secp256r1"
            ):
                raise ValueError()
            encoded = previous.public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            keys[hashlib.sha256(encoded).hexdigest()[:16]] = encoded
        if header.get("kid") not in keys or header.get("typ") != "mcp+at":
            raise ValueError()
        payload = jwt.decode(
            token,
            keys[header["kid"]],
            algorithms=["ES256"],
            audience=settings.MCP_RESOURCE_URL,
            issuer=settings.MCP_ISSUER,
            options={
                "require": [
                    "exp",
                    "iat",
                    "sub",
                    "cid",
                    "jti",
                    "generation",
                    "scope",
                    "typ",
                ]
            },
        )
        if payload["typ"] != "mcp+at" or not isinstance(payload["scope"], str):
            raise ValueError()
    except (jwt.PyJWTError, ValueError, TypeError):
        raise MCPError("invalid_token", 401) from None
    return payload


def authenticate(db, token):
    payload = decode_access(token)
    conn, _ = grant(db, payload["sub"])
    if conn.client_id != payload["cid"] or conn.generation != payload["generation"]:
        raise MCPError("invalid_token", 401)
    return Principal(
        conn.user_email,
        conn.id,
        conn.client_id,
        frozenset(payload["scope"].split()) & frozenset(conn.scopes),
        conn.generation,
    )


def execution_gate(db, principal, required, write=False):
    conn, global_state = grant(
        db, principal.connection_id, lock=True, write=write, required=required
    )
    if principal.generation != conn.generation or required not in principal.scopes:
        raise MCPError("insufficient_scope", 403, scope=required)
    return conn, global_state


def revoke_connections(db, email, reason, connection_id=None):
    lock_personal_user(db, email)
    q = db.query(MCPConnection).filter(MCPConnection.user_email == email, MCPConnection.status == "active")
    if connection_id:
        q = q.filter(MCPConnection.id == connection_id)
    ids = []
    for conn in q.with_for_update().all():
        conn.status, conn.revoked_reason, conn.revoked_at = "revoked", reason, utcnow()
        conn.generation += 1
        ids.append(conn.id)
        from varavu_selavu_service.mcp.audit import audit

        audit(
            db,
            email,
            "connection.revoked",
            outcome=reason,
            connection_id=conn.id,
            client_id=conn.client_id,
        )
    if ids:
        db.query(MCPRefreshToken).filter(MCPRefreshToken.connection_id.in_(ids)).update(
            {"revoked_at": utcnow()}, synchronize_session=False
        )
        db.query(MCPOperation).filter(
            MCPOperation.connection_id.in_(ids),
            MCPOperation.status.in_(["pending_approval", "approved"]),
        ).update(
            {"status": "rejected", "terminal_at": utcnow()}, synchronize_session=False
        )
