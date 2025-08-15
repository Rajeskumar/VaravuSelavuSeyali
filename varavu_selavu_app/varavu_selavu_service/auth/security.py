from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from varavu_selavu_service.core.config import Settings

settings = Settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

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


def create_refresh_token(data: dict, expires_minutes: int = 60 * 24 * 7) -> str:
    return create_token(data, timedelta(minutes=expires_minutes), "refresh")


def decode_token(token: str, token_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") != token_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return payload


def auth_required(token: str = Depends(oauth2_scheme)) -> str:
    payload = decode_token(token, "access")
    return payload.get("sub")

