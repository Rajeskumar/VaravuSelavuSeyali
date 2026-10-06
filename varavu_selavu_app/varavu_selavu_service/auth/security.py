import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import PyJWTError
from sqlalchemy.orm import Session

from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.session import get_db

settings = Settings()

# auto_error=False: a browser authenticates via the HttpOnly cookie and sends no
# Authorization header, which must not itself be a 401.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

ALGORITHM = "HS256"

# The default JWT_SECRET is a publicly-known literal in this repo. Anyone could
# forge a token for any account with it, so refuse to serve traffic if a real
# deployment ever starts without the secret injected.
INSECURE_JWT_SECRETS = {"change-me", "", "secret", "test-secret"}
MIN_JWT_SECRET_LENGTH = 32


def assert_signing_secret_is_safe(env: str, secret: str) -> None:
    """Raises in any non-local environment when the signing key is weak."""
    if env == "local":
        return
    if secret in INSECURE_JWT_SECRETS:
        raise RuntimeError(
            "JWT_SECRET is still the default/placeholder value. Set a strong secret "
            "(from Secret Manager) before serving traffic."
        )
    if len(secret) < MIN_JWT_SECRET_LENGTH:
        raise RuntimeError(
            f"JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} characters; got {len(secret)}."
        )


# Not a valid bcrypt hash (bcrypt hashes always start with "$2"), so bcrypt.checkpw against
# this raises ValueError for *any* candidate password, which verify_password below turns into
# a plain `False`. Used for accounts (e.g. Google SSO) that were never given a real password,
# so no candidate — including an empty string — can ever authenticate as them.
UNUSABLE_PASSWORD_HASH = "!"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(data: dict, expires_delta: timedelta, token_type: str) -> str:
    to_encode = data.copy()
    now = datetime.utcnow()
    # `iat` is what lets a revocation ("everything issued before T is dead") apply to tokens that
    # are otherwise stateless — see auth_required.
    # `iat_ms` is the same instant at millisecond resolution: `iat` is whole seconds, too coarse to
    # tell "issued just before the logout" from "issued just after it" within one second.
    to_encode.update({
        "exp": now + expires_delta,
        "iat": now,
        "iat_ms": int(time.time() * 1000),
        "type": token_type,
    })
    secret = settings.JWT_SECRET
    return jwt.encode(to_encode, secret, algorithm=ALGORITHM)


def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    expires = timedelta(minutes=expires_minutes or settings.JWT_EXPIRE_MINUTES)
    return create_token(data, expires, "access")


def create_refresh_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    expires = timedelta(minutes=expires_minutes or settings.REFRESH_EXPIRE_MINUTES)
    # `jti` makes every refresh token unique. Without it the payload is a pure
    # function of (sub, exp), so two logins in the same second mint an identical
    # token and revoking one silently revokes the other — which breaks both
    # rotation and reuse detection. Callers that need to know the jti ahead of
    # time (to register it in the refresh_tokens table under a specific rotation
    # family before the token itself exists) can pass one in via `data["jti"]`;
    # otherwise one is generated here as before.
    payload = {**data}
    payload.setdefault("jti", str(uuid.uuid4()))
    return create_token(payload, expires, "refresh")


def decode_token(token: str, token_type: str) -> dict:
    try:
        # `algorithms` is an allow-list, not a hint: it is what stops an attacker presenting a
        # token whose own header claims alg:none (or an asymmetric alg, turning a public key
        # into a signing key). Never widen it, and never read the algorithm off the token.
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    except PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") != token_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return payload


def auth_required(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> str:
    """Resolves the caller's identity from the Authorization header when one is sent (native
    clients), otherwise from the access cookie (web). The header wins when both are present:
    it's the credential the client chose to send, a stale cookie left in a native cookie jar
    must not override it, and core/csrf.py exempts header-authenticated requests on exactly
    that basis."""
    from varavu_selavu_service.auth.cookies import ACCESS_COOKIE

    access_token = token or request.cookies.get(ACCESS_COOKIE)
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(access_token, "access")
    email = payload.get("sub")
    _enforce_session_still_valid(db, email, payload)
    return email


def _enforce_session_still_valid(db: Session, email: Optional[str], payload: dict) -> None:
    """Refuses an access token whose account is gone, or that was issued before the account's
    `token_valid_after` (set on logout, password reset/change, "sign out everywhere" and account
    deletion). Without this a signed-out or stolen token kept working until it expired.

    Compared in milliseconds, so a login in the same second as a logout is not rejected by the
    logout's own cut-off while a token issued just before it still is."""
    from varavu_selavu_service.db.models import User

    row = db.query(User.token_valid_after).filter(User.email == email).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    cutoff = row[0]
    if cutoff is not None:
        if cutoff.tzinfo is None:  # SQLite (tests) returns naive UTC
            cutoff = cutoff.replace(tzinfo=timezone.utc)
        issued_ms = payload.get("iat_ms")
        if issued_ms is None:  # token minted before iat_ms existed
            issued_ms = int(payload.get("iat") or 0) * 1000
        if int(issued_ms) < int(cutoff.timestamp() * 1000):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session ended")


# A short built-in list rather than a call to a breach-lookup service: sending even a hash prefix
# of a user's password to a third party is a privacy cost this product doesn't need to take.
_COMMON_PASSWORDS = frozenset("""
password password1 password12 password123 password1234 passw0rd p@ssw0rd p@ssword 12345678 123456789
1234567890 123123123 11111111 00000000 87654321 qwertyui qwerty123 qwertyuiop qwerty12345 1q2w3e4r
1q2w3e4r5t 1qaz2wsx abc12345 abcd1234 abcdefgh iloveyou iloveyou1 letmein1 welcome1 welcome123
admin123 administrator monkey123 dragon123 football1 baseball1 superman1 trustno1 sunshine1 princess1
master123 shadow123 michael123 changeme changeme123 trackspense trackspense1 trackspense123
asdfghjk asdf1234 zxcvbnm1 zaq12wsx
""".split())


def validate_password_strength(password: str, email: Optional[str] = None) -> Optional[str]:
    """Returns a user-facing reason a password is refused, or None when it is acceptable. Length
    (8 to 72 bytes) is enforced by the request models; this adds what length alone misses."""
    lowered = password.lower()
    if lowered in _COMMON_PASSWORDS:
        return "That password is too common. Choose something harder to guess."
    if len(set(lowered)) < 4:
        return "That password repeats too few characters. Choose something harder to guess."
    if email:
        local = email.split("@")[0].lower()
        if len(local) >= 4 and (lowered == local or lowered == email.lower() or local in lowered and len(lowered) <= len(local) + 3):
            return "Your password shouldn't be your email address."
    return None

