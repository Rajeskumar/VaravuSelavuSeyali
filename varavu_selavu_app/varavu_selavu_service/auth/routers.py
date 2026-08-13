import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from google.oauth2 import id_token
from google.auth.transport import requests

from .service import AuthService
from .cookies import CSRF_COOKIE, REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from .security import create_access_token, create_refresh_token, auth_required, decode_token
from sqlalchemy.orm import Session
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.core.limiter import limiter

router = APIRouter(tags=["Auth"])


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(db)


class RegisterRequest(BaseModel):
    name: str
    phone: str
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Tokens are set as HttpOnly cookies for browsers *and* returned in the body
    for native clients, which have no cookie jar and keep using
    `Authorization: Bearer` with SecureStore. The web client ignores these body
    fields and never persists them."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    email: str | None = None
    csrf_token: str | None = None


class RefreshRequest(BaseModel):
    """Native clients post the refresh token; browsers send the refresh cookie
    and omit the body entirely."""

    refresh_token: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    password: str


def _issue_session(response: Response, email: str) -> dict:
    """Mints a token pair, sets the auth cookies, and returns the body payload."""
    access = create_access_token({"sub": email})
    refresh = create_refresh_token({"sub": email})
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
def forgot_password(request: Request, data: ForgotPasswordRequest, auth: AuthService = Depends(get_auth_service)):
    # Always reports success: a "User not found" here tells an attacker which
    # email addresses are registered.
    auth.reset_password(data.email, data.password)
    return {"success": True}


@router.post("/register")
@limiter.limit("5/hour")
def register(request: Request, data: RegisterRequest, auth: AuthService = Depends(get_auth_service)):
    ok = auth.register_user(data.name, data.phone, data.email, data.password)
    if not ok:
        # Deliberately generic — "User already exists" is an enumeration oracle.
        raise HTTPException(status_code=400, detail="Unable to complete registration")
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
    return _issue_session(response, form_data.username)


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

    # Reuse detection: a token that was already exchanged must never work again.
    if auth.is_refresh_token_revoked(presented):
        clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    payload = decode_token(presented, "refresh")
    email = payload.get("sub")

    # Rotation: the presented token is spent as part of issuing the new pair.
    auth.revoke_refresh_token(presented)
    return _issue_session(response, email)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    data: RefreshRequest | None = None,
    auth: AuthService = Depends(get_auth_service),
):
    presented = request.cookies.get(REFRESH_COOKIE) or (data.refresh_token if data else None)
    if presented:
        auth.revoke_refresh_token(presented)
    clear_auth_cookies(response)
    return {"success": True}


@router.post("/session", response_model=TokenResponse)
@limiter.limit("10/minute")
def exchange_session(
    request: Request,
    response: Response,
    data: RefreshRequest | None = None,
    auth: AuthService = Depends(get_auth_service),
):
    """One-time migration for sessions created before cookies existed (P0-1).

    The web client posts the refresh token it still holds in localStorage; we
    validate it, issue cookies, and it clears localStorage. Remove this endpoint
    once refresh-token lifetimes guarantee no legacy sessions remain.
    """
    presented = data.refresh_token if data else None
    if not presented:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if auth.is_refresh_token_revoked(presented):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    payload = decode_token(presented, "refresh")
    auth.revoke_refresh_token(presented)
    return _issue_session(response, payload.get("sub"))


@router.get("/me")
def me(request: Request, user: str = Depends(auth_required)):
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
    return {"email": user, "csrf_token": request.cookies.get(CSRF_COOKIE)}


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
    if not auth.get_user(email):
        auth.register_user(name, "", email, "")
    return _issue_session(response, email)


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
    venmo_handle: str | None = None
    paypal_handle: str | None = None
    upi_id: str | None = None


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

@router.delete("/profile")
def delete_profile(user: str = Depends(auth_required), auth: AuthService = Depends(get_auth_service)):
    ok = auth.delete_user(user)
    if not ok:
        raise HTTPException(status_code=400, detail="Unable to delete profile")
    return {"success": True}
