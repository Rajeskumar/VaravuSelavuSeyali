import uuid
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from varavu_selavu_service.core.config import Settings

settings = Settings()

# auto_error=False: a browser authenticates via the HttpOnly cookie and sends no
# Authorization header, which must not itself be a 401.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(data: dict, expires_delta: timedelta, token_type: str) -> str:
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + expires_delta, "type": token_type})
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
    # rotation and reuse detection.
    return create_token({**data, "jti": str(uuid.uuid4())}, expires, "refresh")


def decode_token(token: str, token_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") != token_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return payload


def auth_required(request: Request, token: Optional[str] = Depends(oauth2_scheme)) -> str:
    """Resolves the caller's identity from the access cookie, falling back to the
    Authorization header so native clients keep working unchanged."""
    from varavu_selavu_service.auth.cookies import ACCESS_COOKIE

    access_token = request.cookies.get(ACCESS_COOKIE) or token
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(access_token, "access")
    return payload.get("sub")

