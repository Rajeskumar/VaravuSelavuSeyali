from typing import Optional
import uuid

from sqlalchemy.orm import Session
from varavu_selavu_service.db.models import User
from .security import hash_password, verify_password

_REVOKED_REFRESH_TOKENS: set[str] = set()


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def get_user(self, email: str) -> Optional[dict]:
        user = self.db.query(User).filter(User.email == email).first()
        if user:
            return {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "phone": user.phone,
                "password_hash": user.password_hash,
                "created_at": user.created_at
            }
        return None

    def register_user(self, name: str, phone: str, email: str, password: str) -> bool:
        if self.get_user(email):
            return False
        hashed = hash_password(password)
        
        db_user = User(
            id=uuid.uuid4(),
            email=email,
            name=name,
            phone=phone,
            password_hash=hashed
        )
        try:
            self.db.add(db_user)
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            return False

    def authenticate_user(self, email: str, password: str) -> bool:
        user = self.get_user(email)
        if not user:
            return False
        stored = (
            user.get("password_hash")
            or user.get("hashed_password")
            or user.get("password")
            or user.get("Password")
        )
        if stored is None:
            return False
        return verify_password(password, stored) or stored == password

    def reset_password(self, email: str, password: str) -> bool:
        user = self.db.query(User).filter(User.email == email).first()
        if not user:
            return False
            
        hashed = hash_password(password)
        user.password_hash = hashed
        self.db.commit()
        return True

    def update_profile(self, email: str, name: Optional[str] = None, phone: Optional[str] = None) -> bool:
        user = self.db.query(User).filter(User.email == email).first()
        if not user:
            return False
            
        if name is not None:
            user.name = name
        if phone is not None:
            user.phone = phone
        self.db.commit()
        return True

    def revoke_refresh_token(self, token: str) -> None:
        _REVOKED_REFRESH_TOKENS.add(token)

    def is_refresh_token_revoked(self, token: str) -> bool:
        return token in _REVOKED_REFRESH_TOKENS
