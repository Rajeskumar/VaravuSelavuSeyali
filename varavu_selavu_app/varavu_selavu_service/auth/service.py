from typing import Optional

from .security import hash_password, verify_password
import psycopg2
import uuid

from varavu_selavu_service.db.postgres import get_db_cursor

# simple in-memory store for revoked refresh tokens
_REVOKED_REFRESH_TOKENS: set[str] = set()


class AuthService:
    def __init__(self):
        pass

    def get_user(self, email: str) -> Optional[dict]:
        with get_db_cursor() as cur:
            cur.execute(
                "SELECT id, email, name, phone, password_hash, created_at FROM trackspense.users WHERE email = %s",
                (email,)
            )
            row = cur.fetchone()
            if row:
                return dict(row)
            return None

    def register_user(self, name: str, phone: str, email: str, password: str) -> bool:
        if self.get_user(email):
            return False
        hashed = hash_password(password)
        
        with get_db_cursor(commit=True) as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO trackspense.users (id, email, name, phone, password_hash)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (str(uuid.uuid4()), email, name, phone, hashed)
                )
                return True
            except psycopg2.IntegrityError:
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
        # support both hashed (bcrypt) and legacy plain-text passwords
        return verify_password(password, stored) or stored == password

    def reset_password(self, email: str, password: str) -> bool:
        user = self.get_user(email)
        if not user:
            return False
            
        hashed = hash_password(password)
        
        with get_db_cursor(commit=True) as cur:
            cur.execute(
                "UPDATE trackspense.users SET password_hash = %s WHERE email = %s",
                (hashed, email)
            )
        return True

    def update_profile(self, email: str, name: Optional[str] = None, phone: Optional[str] = None) -> bool:
        """Update the user's profile fields in the db."""
        user = self.get_user(email)
        if not user:
            return False
            
        with get_db_cursor(commit=True) as cur:
            if name is not None:
                cur.execute("UPDATE trackspense.users SET name = %s WHERE email = %s", (name, email))
            if phone is not None:
                cur.execute("UPDATE trackspense.users SET phone = %s WHERE email = %s", (phone, email))
        return True

    def revoke_refresh_token(self, token: str) -> None:
        _REVOKED_REFRESH_TOKENS.add(token)

    def is_refresh_token_revoked(self, token: str) -> bool:
        return token in _REVOKED_REFRESH_TOKENS
