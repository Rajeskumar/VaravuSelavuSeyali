"""Authlib protocol implementation; the caller owns the database transaction."""

from datetime import timedelta
import logging
import secrets
import uuid
from authlib.oauth2.rfc6749 import AuthorizationServer, OAuth2Request
from authlib.oauth2.rfc6749.requests import BasicOAuth2Payload
from urllib.parse import parse_qsl, urlsplit
from authlib.oauth2.rfc6749.grants import AuthorizationCodeGrant, RefreshTokenGrant
from authlib.oauth2.rfc7636 import CodeChallenge
from varavu_selavu_service.db.mcp_models import OAuthClient, OAuthCode, MCPRefreshToken
from varavu_selavu_service.mcp.security import (
    grant,
    utcnow,
    aware,
    digest,
    mint_access,
    revoke_connections,
)

# Authlib's debug messages can include token responses.
logging.getLogger("authlib").setLevel(logging.WARNING)
SCOPES = {"categories:read", "expenses:read", "expenses:create"}


class Request(OAuth2Request):
    def __init__(self, method, uri, body=None, headers=None):
        super().__init__(method, uri, headers=headers)
        self.payload = BasicOAuth2Payload(
            body if body is not None else dict(parse_qsl(urlsplit(uri).query))
        )

    @property
    def form(self):
        return self.payload.data if self.method == "POST" else {}

    @property
    def args(self):
        return self.payload.data if self.method == "GET" else {}


class Client:
    def __init__(self, row):
        self.row, self.client_id = row, row.client_id

    def get_client_id(self):
        return self.client_id

    def get_default_redirect_uri(self):
        return None  # explicit redirect required

    def check_redirect_uri(self, uri):
        return uri in self.row.redirect_uris

    def check_response_type(self, value):
        return value == "code"

    def check_grant_type(self, value):
        return value in ("authorization_code", "refresh_token")

    def check_endpoint_auth_method(self, method, endpoint):
        return method == "none"

    def get_allowed_scope(self, scope):
        return " ".join(
            sorted(set((scope or "categories:read expenses:read").split()) & SCOPES)
        )

    def check_client_secret(self, secret):
        return False


class Credential:
    def __init__(self, row, connection):
        self.row, self.connection = row, connection
        self.code_challenge = getattr(row, "code_challenge", None)
        self.code_challenge_method = "S256"

    def get_redirect_uri(self):
        return self.row.redirect_uri

    def get_scope(self):
        return " ".join(self.connection.scopes)

    def check_client(self, client):
        return self.connection.client_id == client.client_id


class CodeGrant(AuthorizationCodeGrant):
    TOKEN_ENDPOINT_AUTH_METHODS = ["none"]

    def save_authorization_code(self, code, request):
        self.server.db.add(
            OAuthCode(
                code_hash=digest(code),
                connection_id=request.user.id,
                redirect_uri=request.payload.redirect_uri,
                code_challenge=request.payload.data["code_challenge"],
                expires_at=utcnow() + timedelta(minutes=5),
            )
        )

    def query_authorization_code(self, code, client):
        db = self.server.db
        initial = db.get(OAuthCode, digest(code))
        if initial is None:
            return None
        connection, _ = grant(db, initial.connection_id, lock=True)
        if connection.client_id != client.client_id:
            return None
        row = (
            db.query(OAuthCode)
            .filter_by(code_hash=digest(code))
            .with_for_update()
            .populate_existing()
            .one()
        )
        if row.used_at:
            revoke_connections(
                db, connection.user_email, "authorization_code_reuse", connection.id
            )
            return None
        if aware(row.expires_at) <= utcnow():
            return None
        return Credential(row, connection)

    def delete_authorization_code(self, credential):
        credential.row.used_at = utcnow()

    def authenticate_user(self, credential):
        return credential.connection


class RefreshGrant(RefreshTokenGrant):
    TOKEN_ENDPOINT_AUTH_METHODS = ["none"]
    INCLUDE_NEW_REFRESH_TOKEN = True

    def authenticate_refresh_token(self, token):
        db = self.server.db
        initial = db.get(MCPRefreshToken, digest(token))
        if initial is None:
            return None
        connection, _ = grant(db, initial.connection_id, lock=True)
        if connection.client_id != self.request.client.client_id:
            return None
        row = (
            db.query(MCPRefreshToken)
            .filter_by(token_hash=digest(token))
            .with_for_update()
            .populate_existing()
            .one()
        )
        if row.used_at:
            revoke_connections(
                db, connection.user_email, "refresh_reuse", connection.id
            )
            return None
        if (
            row.revoked_at
            or min(aware(row.expires_at), aware(row.absolute_expires_at)) <= utcnow()
        ):
            return None
        return Credential(row, connection)

    def authenticate_user(self, credential):
        return credential.connection

    def revoke_old_credential(self, credential):
        credential.row.used_at = utcnow()


class Server(AuthorizationServer):
    def __init__(self, db):
        super().__init__(scopes_supported=sorted(SCOPES))
        self.db = db
        self.register_grant(CodeGrant, [CodeChallenge(required=True)])
        self.register_grant(RefreshGrant)
        self.register_token_generator("default", self.token_generator)

    def query_client(self, client_id):
        row = self.db.get(OAuthClient, client_id)
        return Client(row) if row and not row.blocked else None

    def create_oauth2_request(self, request):
        return request

    def handle_response(self, status, body, headers):
        return status, body, headers

    def send_signal(self, *args, **kwargs):
        pass

    def token_generator(
        self,
        client,
        grant_type,
        user,
        scope,
        expires_in=None,
        include_refresh_token=True,
    ):
        # Access is constrained to the requested subset without broadening the stored grant.
        token = mint_access(user, scopes=scope.split())
        return {
            "access_token": token,
            "token_type": "Bearer",
            "expires_in": min(
                600, max(0, int((aware(user.expires_at) - utcnow()).total_seconds()))
            ),
            "refresh_token": secrets.token_urlsafe(48),
            "scope": scope,
        }

    def save_token(self, token, request):
        old = getattr(request, "refresh_token", None)
        old = old.row if old else None
        expiry = (
            aware(old.absolute_expires_at)
            if old
            else min(utcnow() + timedelta(days=30), aware(request.user.expires_at))
        )
        row = MCPRefreshToken(
            token_hash=digest(token["refresh_token"]),
            connection_id=request.user.id,
            family_id=old.family_id if old else str(uuid.uuid4()),
            expires_at=min(utcnow() + timedelta(days=14), expiry),
            absolute_expires_at=expiry,
        )
        self.db.add(row)
        if old:
            old.replaced_by = row.token_hash
