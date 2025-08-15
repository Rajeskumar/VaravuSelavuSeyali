from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr

from .service import AuthService
from .security import create_access_token, create_refresh_token, auth_required, decode_token

router = APIRouter(prefix="/auth", tags=["Auth"])


def get_auth_service() -> AuthService:
    return AuthService()


class RegisterRequest(BaseModel):
    name: str
    phone: str
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/register")
def register(data: RegisterRequest, auth: AuthService = Depends(get_auth_service)):
    ok = auth.register_user(data.name, data.phone, data.email, data.password)
    if not ok:
        raise HTTPException(status_code=400, detail="User already exists")
    return {"success": True}


@router.post("/login", response_model=TokenResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    auth: AuthService = Depends(get_auth_service),
):
    if not auth.authenticate_user(form_data.username, form_data.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    access = create_access_token({"sub": form_data.username})
    refresh = create_refresh_token({"sub": form_data.username})
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}


@router.post("/refresh", response_model=TokenResponse)
def refresh(data: RefreshRequest, auth: AuthService = Depends(get_auth_service)):
    if auth.is_refresh_token_revoked(data.refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    payload = decode_token(data.refresh_token, "refresh")
    email = payload.get("sub")
    access = create_access_token({"sub": email})
    refresh_token = create_refresh_token({"sub": email})
    return {"access_token": access, "refresh_token": refresh_token, "token_type": "bearer"}


@router.post("/logout")
def logout(data: RefreshRequest, auth: AuthService = Depends(get_auth_service)):
    auth.revoke_refresh_token(data.refresh_token)
    return {"success": True}


@router.get("/me")
def me(user: str = Depends(auth_required)):
    return {"email": user}

