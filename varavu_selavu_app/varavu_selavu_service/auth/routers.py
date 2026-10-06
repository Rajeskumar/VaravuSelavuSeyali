import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from google.oauth2 import id_token
from google.auth.transport import requests

from .service import AuthService, EMAIL_VERIFY_TOKEN_TTL, PASSWORD_RESET_TOKEN_TTL
from .cookies import CSRF_COOKIE, REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from .security import create_access_token, create_refresh_token, auth_required, decode_token, validate_password_strength, verify_password
from sqlalchemy.orm import Session
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.core.limiter import limiter
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.models.api_models import PaymentHandle
from varavu_selavu_service.services.email_service import send_transactional_email

router = APIRouter(tags=["Auth"])
logger = logging.getLogger(__name__)
_settings = Settings()


def _mask_email(email: str) -> str:
    """a***@example.com — enough to correlate a log line, not enough to harvest addresses."""
    local, _, domain = (email or "").partition("@")
    return f"{local[:1]}***@{domain}" if domain else "***"


def _send_verification_email(user_email: str, token: str) -> None:
    """Best-effort — a send failure must never block registration or login; the user can
    always hit "resend verification" once logged in."""
    try:
        send_transactional_email(
            to_email=user_email,
            subject="Verify your TrackSpense email",
            heading="Verify your email",
            body_html="Confirm this is your email address to finish setting up TrackSpense.",
            cta_label="Verify email",
            cta_url=f"{_settings.PUBLIC_APP_URL}/verify-email?token={token}",
        )
    except Exception:
        logger.exception("Failed to send verification email to %s", _mask_email(user_email))


def _send_password_reset_email(user_email: str, token: str) -> None:
    try:
        send_transactional_email(
            to_email=user_email,
            subject="Reset your TrackSpense password",
            heading="Reset your password",
            body_html="We received a request to reset your TrackSpense password. This link expires in 1 hour.",
            cta_label="Reset password",
            cta_url=f"{_settings.PUBLIC_APP_URL}/reset-password?token={token}",
        )
    except Exception:
        logger.exception("Failed to send password reset email to %s", _mask_email(user_email))


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(db)


# bcrypt hashes at most 72 bytes and silently ignores the rest, so a longer passphrase is
# only ever as strong as its first 72 bytes. Reject rather than quietly truncate, so nobody
# believes they have more entropy than they do. Security audit VS-16.
MAX_PASSWORD_BYTES = 72


class RegisterRequest(BaseModel):
    name: str
    phone: Optional[str] = None
    email: EmailStr
    password: str = Field(min_length=8, max_length=MAX_PASSWORD_BYTES)


class TokenResponse(BaseModel):
    """Tokens are set as HttpOnly cookies for browsers *and* returned in the body
    for native clients, which have no cookie jar and keep using
    `Authorization: Bearer` with SecureStore. The web client ignores these body
    fields and never persists them."""

    # Omitted (null) for browsers: they authenticate with the HttpOnly cookies, and a token in a
    # JSON body is readable by any script that can read the response. Native clients (no
    # `X-TrackSpense-Client: web` header) still receive them.
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    email: str | None = None
    csrf_token: str | None = None


class RefreshRequest(BaseModel):
    """Native clients post the refresh token; browsers send the refresh cookie
    and omit the body entirely."""

    refresh_token: str | None = None


WEB_CLIENT_HEADER = "x-trackspense-client"


def _for_client(request: Request, body: dict) -> dict:
    if request.headers.get(WEB_CLIENT_HEADER, "").lower() == "web":
        body = {**body, "access_token": None, "refresh_token": None}
    return body


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=MAX_PASSWORD_BYTES)


class VerifyEmailRequest(BaseModel):
    token: str


def _issue_session(
    response: Response,
    auth: AuthService,
    email: str,
    family_id: Optional[uuid.UUID] = None,
    jti: Optional[uuid.UUID] = None,
) -> dict:
    """Mints a token pair, sets the auth cookies, registers the refresh token's rotation
    state, and returns the body payload.

    `family_id=None` starts a brand-new family (login, Google login, a legacy-session
    exchange's replacement token) — pass the family_id returned by
    `AuthService.rotate_refresh_token` to continue an existing one instead (refresh). `jti` lets a caller that already generated one (to pass into
    `rotate_refresh_token` for `replaced_by` tracking) reuse it here instead of minting a
    second, mismatched one.
    """
    access = create_access_token({"sub": email})
    new_jti = jti or uuid.uuid4()
    refresh = create_refresh_token({"sub": email, "jti": str(new_jti)})
    # Single source of truth for the DB row's expiry: whatever `create_refresh_token` actually
    # embedded, not a second independent computation that could drift from it.
    expires_at = datetime.fromtimestamp(decode_token(refresh, "refresh")["exp"], tz=timezone.utc)

    auth.register_refresh_token(new_jti, family_id or uuid.uuid4(), email, expires_at)

    csrf_token = set_auth_cookies(response, access, refresh)
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "email": email,
        "csrf_token": csrf_token,
    }


@router.post("/forgot-password")
@limiter.limit("5/hour")
def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    auth: AuthService = Depends(get_auth_service),
):
    # Always reports success: a "User not found" here tells an attacker which email
    # addresses are registered. If the account exists, email it a one-time reset link —
    # this endpoint never accepts a new password directly (that used to be a critical
    # account-takeover bug: anyone who knew a user's email could reset their password with
    # zero proof of ownership, protected only by a 5/hour rate limit).
    if auth.get_user(data.email):
        token = auth.create_email_token(data.email, "reset_password", PASSWORD_RESET_TOKEN_TTL)
        # Sent after the response: an in-request SMTP send made this reply measurably slower
        # for registered emails than unregistered ones (a timing oracle), and slow mail
        # servers stalled the request.
        background_tasks.add_task(_send_password_reset_email, data.email, token)
    return {"success": True}


@router.post("/reset-password")
@limiter.limit("5/hour")
def reset_password(request: Request, data: ResetPasswordRequest, auth: AuthService = Depends(get_auth_service)):
    email = auth.redeem_email_token(data.token, "reset_password")
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    weak = validate_password_strength(data.password, email)
    if weak:
        raise HTTPException(status_code=400, detail=weak)
    auth.reset_password(email, data.password)
    # The presumed reason for a reset is a compromised password — don't leave any
    # session alive under the old one, refresh or access.
    auth.end_all_sessions(email, reason="password_reset")
    return {"success": True}


@router.post("/verify-email")
@limiter.limit("10/hour")
def verify_email(request: Request, data: VerifyEmailRequest, auth: AuthService = Depends(get_auth_service)):
    email = auth.redeem_email_token(data.token, "verify_email")
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    auth.mark_email_verified(email)
    return {"success": True}


@router.post("/resend-verification")
@limiter.limit("3/hour")
def resend_verification(
    request: Request,
    background_tasks: BackgroundTasks,
    user: str = Depends(auth_required),
    auth: AuthService = Depends(get_auth_service),
):
    if auth.is_email_verified(user):
        return {"success": True, "already_verified": True}
    token = auth.create_email_token(user, "verify_email", EMAIL_VERIFY_TOKEN_TTL)
    background_tasks.add_task(_send_verification_email, user, token)
    return {"success": True, "already_verified": False}


@router.post("/register")
@limiter.limit("5/hour")
def register(
    request: Request,
    data: RegisterRequest,
    background_tasks: BackgroundTasks,
    auth: AuthService = Depends(get_auth_service),
):
    weak = validate_password_strength(data.password, data.email)
    if weak:
        raise HTTPException(status_code=422, detail=[{"loc": ["body", "password"], "msg": weak, "type": "value_error"}])
    ok = auth.register_user(data.name, data.phone, data.email, data.password)
    if not ok:
        # Deliberately generic — "User already exists" is an enumeration oracle.
        raise HTTPException(status_code=400, detail="Unable to complete registration")
    token = auth.create_email_token(data.email, "verify_email", EMAIL_VERIFY_TOKEN_TTL)
    # After the response, so sign-up doesn't wait on the mail server (it took 4s+).
    background_tasks.add_task(_send_verification_email, data.email, token)
    return {"success": True}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    auth: AuthService = Depends(get_auth_service),
):
    if not auth.authenticate_user(form_data.username, form_data.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return _for_client(request, _issue_session(response, auth, form_data.username))


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
def refresh(
    request: Request,
    response: Response,
    data: RefreshRequest | None = None,
    auth: AuthService = Depends(get_auth_service),
):
    presented = request.cookies.get(REFRESH_COOKIE) or (data.refresh_token if data else None)
    if not presented:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Signature/expiry/type validated first — only a cryptographically genuine refresh token's
    # jti is ever used as a DB lookup key.
    payload = decode_token(presented, "refresh")
    email = payload.get("sub")
    old_jti = uuid.UUID(payload["jti"])
    new_jti = uuid.uuid4()

    # Rotation + reuse detection (with a grace period for legitimate concurrent-tab/device
    # races): raises 401 and revokes the whole family on genuine reuse. See
    # AuthService.rotate_refresh_token.
    try:
        family_id = auth.rotate_refresh_token(old_jti, new_jti)
    except HTTPException:
        clear_auth_cookies(response)
        raise
    return _for_client(request, _issue_session(response, auth, email, family_id=family_id, jti=new_jti))


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    data: RefreshRequest | None = None,
    auth: AuthService = Depends(get_auth_service),
):
    presented = request.cookies.get(REFRESH_COOKIE) or (data.refresh_token if data else None)
    if presented:
        # Best-effort: logout must never itself fail just because the presented token happens
        # to already be expired/malformed — there's simply nothing left to revoke in that case.
        try:
            claims = decode_token(presented, "refresh")
            auth.revoke_refresh_token(uuid.UUID(claims["jti"]))
            # Also end access tokens issued so far: a copied access token otherwise outlived the
            # logout by up to its full lifetime. Other devices refresh transparently.
            if claims.get("sub"):
                auth.end_access_tokens(claims["sub"])
        except HTTPException:
            pass
    clear_auth_cookies(response)
    return {"success": True}


@router.get("/me")
def me(request: Request, user: str = Depends(auth_required), auth: AuthService = Depends(get_auth_service)):
    """Also echoes the current `vs_csrf` cookie value in the body.

    The frontend and backend are cross-site in prod (`expense.cerebroos.com`
    vs `*.run.app`), so client JS can never read `vs_csrf` via
    `document.cookie` — that's scoped to the page's own origin, not the
    backend's. The browser still attaches the cookie correctly to *requests*
    (that's a separate, origin-agnostic mechanism), so the server can always
    read it back off `request.cookies` and hand it to the client here — no
    new token minted, just relaying the one already in hand. This is how a
    reloaded page (session already valid, nothing freshly issued by
    login/refresh) gets a CSRF token to echo on its first mutating request.
    """
    return {
        "email": user,
        "csrf_token": request.cookies.get(CSRF_COOKIE),
        "email_verified": auth.is_email_verified(user),
        # Lets the client ask for the current password only when there is one (Google-only
        # accounts have none).
        "has_password": auth.has_usable_password(user),
    }


class GoogleLoginRequest(BaseModel):
    id_token: str


@router.post("/google", response_model=TokenResponse)
@limiter.limit("10/minute")
def google_login(
    request: Request,
    response: Response,
    data: GoogleLoginRequest,
    auth: AuthService = Depends(get_auth_service),
):
    try:
        token_info = id_token.verify_oauth2_token(
            data.id_token,
            requests.Request(),
            os.getenv("GOOGLE_CLIENT_ID"),
        )
    except Exception:  # noqa: B902 - broad to return HTTP error
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    email = token_info.get("email")
    name = token_info.get("name", email)
    # Without Google's own assertion that the mailbox is verified, the address proves nothing
    # and must not be matched to (or create) an account.
    if not email or token_info.get("email_verified") is not True:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    existing = auth.get_user(email)
    if not existing:
        auth.register_user(name, "", email, "")
    elif not auth.is_email_verified(email):
        # A password account for this address that was never verified may have been created by
        # someone other than the mailbox owner, who then knows its password. Wipe it and end
        # its sessions before the real owner is signed in (account pre-hijacking).
        auth.neutralize_unverified_account(email)
    # Google already verified this address — no reason to make the user verify it a second
    # time through our own email-link flow.
    auth.mark_email_verified(email)
    return _for_client(request, _issue_session(response, auth, email))


class ProfileResponse(BaseModel):
    email: EmailStr
    name: str | None = None
    phone: str | None = None
    address: str | None = None
    # TS-GRP-130: payment deep-link handles — client-constructed URLs only,
    # TrackSpense never touches money or these providers' APIs.
    venmo_handle: str | None = None
    paypal_handle: str | None = None
    upi_id: str | None = None


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    address: str | None = None
    # Constrained shape + ceiling: these decide where another member sends money and are
    # rendered to other people. Security audit VS-16.
    venmo_handle: PaymentHandle = None
    paypal_handle: PaymentHandle = None
    upi_id: PaymentHandle = None


def _profile_dto(user: str, payload: Optional[UpdateProfileRequest], data: dict) -> dict:
    def field(name: str):
        override = getattr(payload, name, None) if payload is not None else None
        return override if override is not None else (data.get(name) or data.get(name.capitalize()) or None)

    return {
        "email": user,
        "name": field("name"),
        "phone": field("phone"),
        "address": field("address"),
        "venmo_handle": field("venmo_handle"),
        "paypal_handle": field("paypal_handle"),
        "upi_id": field("upi_id"),
    }


@router.get("/profile", response_model=ProfileResponse)
def get_profile(user: str = Depends(auth_required), auth: AuthService = Depends(get_auth_service)):
    data = auth.get_user(user) or {}
    return _profile_dto(user, None, data)


@router.put("/profile", response_model=ProfileResponse)
def update_profile(payload: UpdateProfileRequest, user: str = Depends(auth_required), auth: AuthService = Depends(get_auth_service)):
    ok = auth.update_profile(
        email=user,
        name=payload.name,
        phone=payload.phone,
        address=payload.address,
        venmo_handle=payload.venmo_handle,
        paypal_handle=payload.paypal_handle,
        upi_id=payload.upi_id,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Unable to update profile")
    data = auth.get_user(user) or {}
    return _profile_dto(user, payload, data)

class DeleteAccountRequest(BaseModel):
    """Proof the person at the keyboard owns the account: the password, or — for accounts that
    never had one (Google sign-in) — the account's own email typed out."""

    password: str | None = None
    confirm_email: str | None = None


@router.delete("/profile")
@limiter.limit("5/hour")
def delete_profile(
    request: Request,
    response: Response,
    data: DeleteAccountRequest | None = None,
    user: str = Depends(auth_required),
    auth: AuthService = Depends(get_auth_service),
):
    # A stolen session cookie (or a walk-up to an unlocked laptop) must not be enough to erase an
    # account permanently.
    data = data or DeleteAccountRequest()
    if auth.has_usable_password(user):
        record = auth.get_user(user) or {}
        stored = record.get("password_hash") or record.get("password") or ""
        if not data.password or not verify_password(data.password, stored):
            raise HTTPException(status_code=403, detail="Enter your password to delete your account")
    elif (data.confirm_email or "").strip().lower() != user.lower():
        raise HTTPException(status_code=403, detail="Type your email address to confirm deleting your account")
    ok = auth.delete_user(user)
    if not ok:
        raise HTTPException(status_code=400, detail="Unable to delete profile")
    clear_auth_cookies(response)
    return {"success": True}


class ChangePasswordRequest(BaseModel):
    current_password: str | None = None
    new_password: str = Field(min_length=8, max_length=MAX_PASSWORD_BYTES)


@router.post("/change-password", response_model=TokenResponse)
@limiter.limit("5/hour")
def change_password(
    request: Request,
    response: Response,
    data: ChangePasswordRequest,
    user: str = Depends(auth_required),
    auth: AuthService = Depends(get_auth_service),
):
    """Signed-in password change. Every other session (refresh and access) is ended and this
    one is re-issued, so a copied session dies with the old password."""
    if auth.has_usable_password(user):
        record = auth.get_user(user) or {}
        stored = record.get("password_hash") or record.get("password") or ""
        if not data.current_password or not verify_password(data.current_password, stored):
            raise HTTPException(status_code=403, detail="Current password is incorrect")
        if data.current_password == data.new_password:
            raise HTTPException(status_code=400, detail="Choose a password different from your current one")
    weak = validate_password_strength(data.new_password, user)
    if weak:
        raise HTTPException(status_code=400, detail=weak)
    auth.reset_password(user, data.new_password)
    auth.end_all_sessions(user, reason="password_changed")
    return _for_client(request, _issue_session(response, auth, user))


@router.get("/sessions")
def list_sessions(request: Request, user: str = Depends(auth_required), auth: AuthService = Depends(get_auth_service)):
    """Active sign-ins (one per login, however many times its token has rotated)."""
    presented = request.cookies.get(REFRESH_COOKIE)
    current = None
    if presented:
        try:
            current = auth.family_of_refresh_token(uuid.UUID(decode_token(presented, "refresh")["jti"]))
        except (HTTPException, ValueError, KeyError):
            current = None
    items = auth.list_sessions(user)
    return {
        "items": [
            {
                "family_id": i["family_id"],
                "signed_in_at": i["signed_in_at"],
                "last_active_at": i["last_active_at"],
                "current": current is not None and i["family_id"] == str(current),
            }
            for i in items
        ]
    }


@router.delete("/sessions/{family_id}")
def revoke_session(family_id: uuid.UUID, user: str = Depends(auth_required), auth: AuthService = Depends(get_auth_service)):
    if not auth.revoke_family_for_user(user, family_id):
        raise HTTPException(status_code=404, detail="Session not found")
    auth.end_access_tokens(user)
    return {"success": True}


@router.post("/logout-all")
def logout_all(response: Response, user: str = Depends(auth_required), auth: AuthService = Depends(get_auth_service)):
    """Signs the account out everywhere, this device included."""
    auth.end_all_sessions(user, reason="logout")
    clear_auth_cookies(response)
    return {"success": True}
