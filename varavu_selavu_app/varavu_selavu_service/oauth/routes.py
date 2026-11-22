"""OAuth endpoints and first-party, session-authenticated consent/approval API."""

from datetime import timedelta
import re
import secrets
import uuid
import anyio
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from authlib.oauth2.rfc6749 import OAuth2Error
from varavu_selavu_service.auth.security import (
    auth_required,
    decode_token,
    _enforce_session_still_valid,
)
from varavu_selavu_service.auth.cookies import ACCESS_COOKIE
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.db.models import User, RefreshToken
from varavu_selavu_service.db.mcp_models import (
    OAuthRequest,
    OAuthClient,
    MCPConnection,
    MCPRefreshToken,
    MCPAuditEvent,
)
from varavu_selavu_service.oauth.server import (
    Server,
    SCOPES,
    Request as OAuthRequestAdapter,
)
from varavu_selavu_service.mcp.security import (
    controls,
    utcnow,
    aware,
    digest,
    revoke_connections,
    MCPError,
    decode_access,
)
from varavu_selavu_service.mcp.audit import audit
from varavu_selavu_service.mcp.rate_limit import reserve, user_subject
from varavu_selavu_service.mcp.operations import get_operation, output, decide
from varavu_selavu_service.services.personal_write_lock import lock_personal_user

router = APIRouter()
FORM_READ_SECONDS = 10
_oauth_capacity = anyio.CapacityLimiter(16)


def active(db=Depends(get_db)):
    controls(db)
    return db


def fresh(request: Request, email=Depends(auth_required), db=Depends(get_db)):
    if request.headers.get("authorization") or not request.cookies.get(ACCESS_COOKIE):
        raise HTTPException(
            403, detail="Open this request in the TrackSpense browser to approve it"
        )
    token = request.cookies.get(ACCESS_COOKIE)
    claims = decode_token(token, "access")
    if (
        claims.get("sub") != email
        or not claims.get("sid")
        or not isinstance(claims.get("auth_time"), (float, int))
        or not 0 <= utcnow().timestamp() - claims["auth_time"] <= 43200
    ):
        raise HTTPException(403, detail="Sign in again to approve this request")
    user = db.query(User).filter_by(email=email).one()
    if not user.email_verified:
        raise HTTPException(
            403, detail="Verify your email before connecting an assistant"
        )
    enforce_live_session(db, email, claims)
    return email, claims["sid"], claims


def enforce_live_session(db, email, claims):
    try:
        family = uuid.UUID(claims.get("sid", ""))
    except (ValueError, TypeError):
        raise HTTPException(
            403, detail="Sign in again to approve this request"
        ) from None
    active = (
        db.query(RefreshToken.jti)
        .filter(
            RefreshToken.family_id == family,
            RefreshToken.user_email == email,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > utcnow(),
        )
        .first()
    )
    from varavu_selavu_service.auth.service import AuthService

    if active is None or AuthService(db)._family_hard_killed(family):
        raise HTTPException(403, detail="Sign in again to approve this request")


def locked_session(db, identity):
    email, _, claims = identity
    lock_personal_user(db, email)
    _enforce_session_still_valid(db, email, claims)
    enforce_live_session(db, email, claims)


def request_row(db, rid, email, lock=False):
    q = db.query(OAuthRequest).filter_by(id=rid)
    row = (q.with_for_update() if lock else q).populate_existing().first()
    if (
        not row
        or row.consumed_at
        or aware(row.expires_at) <= utcnow()
        or row.user_email not in (None, email)
    ):
        raise HTTPException(404, detail="Request unavailable")
    return row


def callback(uri, parameters):
    parts = urlsplit(uri)
    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(parse_qsl(parts.query) + list(parameters.items())),
            "",
        )
    )


@router.get("/.well-known/oauth-protected-resource/mcp")
def resource_metadata():
    s = Settings()
    return {
        "resource": s.MCP_RESOURCE_URL,
        "authorization_servers": [s.MCP_ISSUER],
        "scopes_supported": sorted(SCOPES),
        "bearer_methods_supported": ["header"],
    }


@router.get("/.well-known/oauth-authorization-server")
def server_metadata():
    root = Settings().MCP_ISSUER.rstrip("/")
    return {
        "issuer": Settings().MCP_ISSUER,
        "authorization_endpoint": root + "/oauth/authorize",
        "token_endpoint": root + "/oauth/token",
        "revocation_endpoint": root + "/oauth/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["none"],
        "revocation_endpoint_auth_methods_supported": ["none"],
        "code_challenge_methods_supported": ["S256"],
        "scopes_supported": sorted(SCOPES),
        "client_id_metadata_document_supported": bool(
            Settings().MCP_CIMD_ALLOWED_HOSTS
        ),
    }


@router.get("/oauth/authorize")
def authorize(request: Request, db=Depends(active)):
    pairs = list(request.query_params.multi_items())
    if len(pairs) != len(dict(pairs)) or len(str(request.url)) > 8192:
        raise HTTPException(400, detail="Invalid authorization request")
    values = dict(pairs)
    if (
        values.get("resource") != Settings().MCP_RESOURCE_URL
        or values.get("response_type") != "code"
        or values.get("code_challenge_method") != "S256"
        or not re.fullmatch(r"[A-Za-z0-9_-]{43}", values.get("code_challenge", ""))
        or not 1 <= len(values.get("state", "")) <= 2048
        or not values.get("redirect_uri")
        or not set(values.get("scope", "categories:read expenses:read").split())
        <= SCOPES
        or "categories:read"
        not in values.get("scope", "categories:read expenses:read").split()
    ):
        raise HTTPException(400, detail="Invalid authorization request")
    reserve(
        db,
        "ip:" + digest(request.client.host if request.client else "unknown"),
        "authorize",
        60,
        20,
    )
    db.commit()
    server = Server(db)
    if values.get("client_id", "").startswith("https://"):
        from varavu_selavu_service.oauth.cimd import load_client

        load_client(db, values["client_id"])
    oauth_request = OAuthRequestAdapter(
        "GET",
        Settings().MCP_ISSUER.rstrip("/") + "/oauth/authorize?" + urlencode(values),
    )
    try:
        authorization_grant = server.get_authorization_grant(oauth_request)
        authorization_grant.validate_authorization_request()
    except OAuth2Error:
        raise HTTPException(400, detail="Invalid authorization request") from None
    row = OAuthRequest(
        id=secrets.token_urlsafe(32),
        client_id=values["client_id"],
        redirect_uri=values["redirect_uri"],
        scopes=values.get("scope", "categories:read expenses:read").split(),
        code_challenge=values["code_challenge"],
        state=values["state"],
        resource=values["resource"],
        expires_at=utcnow() + timedelta(minutes=10),
    )
    db.add(row)
    db.commit()
    return RedirectResponse(
        Settings().PUBLIC_APP_URL.rstrip("/") + "/ai/connect/" + row.id, status_code=303
    )


async def form_values(request):
    if (
        request.headers.get("content-type", "").split(";")[0]
        != "application/x-www-form-urlencoded"
    ):
        raise HTTPException(400, detail="Form encoding required")
    body = bytearray()
    try:
        with anyio.fail_after(FORM_READ_SECONDS):
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 16384:
                    raise HTTPException(413, detail="Request too large")
    except TimeoutError:
        raise HTTPException(408, detail="Request body timed out") from None
    try:
        pairs = parse_qsl(
            body.decode("utf-8"), keep_blank_values=True, max_num_fields=20
        )
    except (ValueError, UnicodeError):
        raise HTTPException(400, detail="Invalid form") from None
    if len(pairs) != len(dict(pairs)):
        raise HTTPException(400, detail="Duplicate form parameter")
    return dict(pairs)


async def oauth_form(request):
    # Bound waiting readers before touching the shared database pool. The lease is
    # released by the endpoint after its worker finishes, even on disconnect/error.
    try:
        _oauth_capacity.acquire_nowait()
    except anyio.WouldBlock:
        raise HTTPException(
            429, detail="OAuth busy; retry later", headers={"Retry-After": "1"}
        ) from None
    try:
        return await form_values(request)
    except BaseException:
        _oauth_capacity.release()
        raise


def charge_oauth(db, request, bucket):
    reserve(
        db,
        "ip:" + digest(request.client.host if request.client else "unknown"),
        bucket,
        60,
        30,
    )
    # Charge invalid attempts too; no financial write is part of this transaction.
    db.commit()


@router.post("/oauth/token")
async def token(request: Request, db=Depends(get_db)):
    # get_db constructs a lazy session; only the worker below checks out a connection.
    values = await oauth_form(request)

    def exchange():
        controls(db)
        charge_oauth(db, request, "token")
        if values.get("resource") != Settings().MCP_RESOURCE_URL:
            return 400, {"error": "invalid_target"}, []
        try:
            result = Server(db).create_token_response(
                OAuthRequestAdapter(
                    "POST",
                    Settings().MCP_ISSUER.rstrip("/") + "/oauth/token",
                    body=values,
                    headers=dict(request.headers),
                )
            )
            db.commit()  # includes reuse revocation when Authlib returns invalid_grant
            return result
        except MCPError:
            db.rollback()
            return 400, {"error": "invalid_grant"}, [("Cache-Control", "no-store")]

    try:
        status, body, headers = await anyio.to_thread.run_sync(exchange)
        return JSONResponse(body, status, headers=dict(headers))
    finally:
        _oauth_capacity.release()


@router.post("/oauth/revoke")
async def revoke(request: Request, db=Depends(get_db)):
    values = await oauth_form(request)

    def revoke_token():
        charge_oauth(db, request, "revoke")
        raw = values.get("token", "")
        row = db.get(MCPRefreshToken, digest(raw))
        conn = db.get(MCPConnection, row.connection_id) if row else None
        if not conn:
            try:
                conn = db.get(MCPConnection, decode_access(raw)["sub"])
            except MCPError:
                pass
        if conn and conn.client_id == values.get("client_id"):
            revoke_connections(db, conn.user_email, "oauth_revocation", conn.id)
            audit(db, conn.user_email, "connection.revoked", connection_id=conn.id)
        db.commit()
        return {}

    try:
        return await anyio.to_thread.run_sync(revoke_token)
    finally:
        _oauth_capacity.release()


class Consent(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    approve: bool
    scopes: list[str] = Field(max_length=3)


@router.get("/api/v1/mcp/consent/{rid}")
def consent_info(rid: str, identity=Depends(fresh), db=Depends(active)):
    locked_session(db, identity)
    row = request_row(db, rid, identity[0], lock=True)
    client = db.get(OAuthClient, row.client_id)
    result = {
        "client_name": client.client_name,
        "client_id": client.client_id,
        "verified": client.verified,
        "scopes": [
            s
            for s in row.scopes
            if s != "expenses:create"
            or (Settings().MCP_WRITES_ENABLED and not controls(db).writes_disabled)
        ],
        "expires_at": row.expires_at,
    }
    db.commit()
    return result


@router.post("/api/v1/mcp/consent/{rid}")
def consent_decision(
    rid: str, data: Consent, identity=Depends(fresh), db=Depends(active)
):
    locked_session(db, identity)
    row = request_row(db, rid, identity[0], lock=True)
    if (
        row.user_email not in (None, identity[0])
        or not set(data.scopes) <= set(row.scopes)
        or (data.approve and "categories:read" not in data.scopes)
    ):
        raise HTTPException(400, detail="Invalid scope selection")
    from varavu_selavu_service.db.mcp_models import MCPUserPolicy

    policy = db.get(MCPUserPolicy, identity[0], populate_existing=True)
    if policy and policy.suspended:
        raise HTTPException(403, detail="Assistant access suspended")
    global_state = controls(db)
    if (
        data.approve
        and "expenses:create" in data.scopes
        and (not Settings().MCP_WRITES_ENABLED or global_state.writes_disabled)
    ):
        raise HTTPException(403, detail="Expense creation is not available")
    client = db.get(OAuthClient, row.client_id, populate_existing=True)
    if client.blocked:
        raise HTTPException(403, detail="Client unavailable")
    if not data.approve:
        location = callback(
            row.redirect_uri, {"error": "access_denied", "state": row.state}
        )
    else:
        if (
            db.query(MCPConnection.id)
            .filter(
                MCPConnection.user_email == identity[0],
                MCPConnection.status == "active",
                MCPConnection.expires_at > utcnow(),
            )
            .count()
            >= 20
        ):
            raise HTTPException(
                409, detail="Disconnect an existing assistant before connecting another"
            )
        reserve(
            db,
            user_subject(identity[0]),
            "connections",
            86400,
            20,
            user_email=identity[0],
        )
        conn = MCPConnection(
            user_email=identity[0],
            client_id=client.client_id,
            client_name=client.client_name,
            scopes=data.scopes,
            expires_at=utcnow() + timedelta(days=90),
        )
        db.add(conn)
        db.flush()
        values = dict(
            client_id=client.client_id,
            response_type="code",
            redirect_uri=row.redirect_uri,
            scope=" ".join(data.scopes),
            code_challenge=row.code_challenge,
            code_challenge_method="S256",
            state=row.state,
            resource=row.resource,
        )
        req = OAuthRequestAdapter(
            "GET",
            Settings().MCP_ISSUER.rstrip("/") + "/oauth/authorize?" + urlencode(values),
        )
        server = Server(db)
        authorization_grant = server.get_authorization_grant(req)
        redirect = authorization_grant.validate_authorization_request()
        _, _, headers = authorization_grant.create_authorization_response(
            redirect, conn
        )
        location = dict(headers)["Location"]
        audit(db, identity[0], "connection.created", connection_id=conn.id)
    row.user_email = identity[0]
    row.bound_session = identity[1]
    if not data.approve:
        audit(db, identity[0], "consent.denied", client_id=row.client_id)
    row.consumed_at = utcnow()
    db.commit()
    return {"redirect_url": location}


@router.get("/api/v1/mcp/connections")
def connections(email=Depends(auth_required), db=Depends(get_db)):
    rows = (
        db.query(MCPConnection)
        .filter_by(user_email=email)
        .order_by(
            (MCPConnection.status == "active").desc(), MCPConnection.created_at.desc()
        )
        .limit(100)
        .all()
    )
    return [
        {
            "id": r.id,
            "client_name": r.client_name,
            "scopes": r.scopes,
            "status": r.status,
            "writes_enabled": r.writes_enabled,
            "created_at": r.created_at,
            "expires_at": r.expires_at,
        }
        for r in rows
    ]


@router.delete("/api/v1/mcp/connections/{cid}")
def disconnect(cid: str, email=Depends(auth_required), db=Depends(get_db)):
    if not db.query(MCPConnection.id).filter_by(id=cid, user_email=email).first():
        raise HTTPException(404, detail="Not found")
    revoke_connections(db, email, "user_disconnected", cid)
    audit(db, email, "connection.revoked", connection_id=cid)
    db.commit()
    return {"success": True}


@router.get("/api/v1/mcp/activity")
def activity(email=Depends(auth_required), db=Depends(get_db)):
    rows = (
        db.query(MCPAuditEvent)
        .filter_by(user_email=email)
        .order_by(MCPAuditEvent.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": r.id,
            "event": r.event,
            "outcome": r.outcome,
            "created_at": r.created_at,
            "connection_id": r.connection_id,
        }
        for r in rows
    ]


@router.get("/api/v1/mcp/approvals/{oid}")
def approval_info(oid: str, email=Depends(auth_required), db=Depends(get_db)):
    row = get_operation(db, email, oid)
    result = output(db, row)
    db.commit()
    return result


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    approve: bool
    approval_revision: int = Field(ge=1)
    acknowledge_warnings: bool = False


@router.post("/api/v1/mcp/approvals/{oid}")
def approval_decision(
    oid: str, data: Decision, identity=Depends(fresh), db=Depends(get_db)
):
    # decide acquires the global/client/user/grant locks before rechecking session revocation.
    result = decide(
        db,
        identity[0],
        oid,
        data.approval_revision,
        data.approve,
        data.acknowledge_warnings,
        identity[1],
    )
    _enforce_session_still_valid(db, identity[0], identity[2])
    enforce_live_session(db, identity[0], identity[2])
    db.commit()
    return result
