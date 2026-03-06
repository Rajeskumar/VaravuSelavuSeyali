from typing import Optional

from varavu_selavu_service.db.google_sheets import GoogleSheetsClient
from .security import hash_password, verify_password
from varavu_selavu_service.core.config import Settings
import psycopg2
import uuid

settings = Settings()

if settings.USE_POSTGRES:
    from varavu_selavu_service.db.postgres import get_db_cursor

# simple in-memory store for revoked refresh tokens
_REVOKED_REFRESH_TOKENS: set[str] = set()


class AuthService:
    def __init__(self, user_ws=None):
        self.is_mock = user_ws is not None
        if user_ws is None:
            gs = GoogleSheetsClient()
            # use existing `user_data` sheet for user credentials
            self.user_ws = gs.user_data_sheet()
        else:
            self.user_ws = user_ws

    def _all_users(self):
        return self.user_ws.get_all_records()

    def get_user(self, email: str) -> Optional[dict]:
        if settings.USE_POSTGRES and not self.is_mock:
            with get_db_cursor() as cur:
                cur.execute(
                    "SELECT id, email, name, phone, password_hash, created_at FROM trackspense.users WHERE email = %s",
                    (email,)
                )
                row = cur.fetchone()
                if row:
                    return dict(row)
                return None
                
        records = self._all_users()
        return next(
            (u for u in records if (u.get("email") or u.get("Email")) == email),
            None,
        )

    def register_user(self, name: str, phone: str, email: str, password: str) -> bool:
        if self.get_user(email):
            return False
        hashed = hash_password(password)
        
        if settings.USE_POSTGRES and not self.is_mock:
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
                    
        # user_data sheet columns: name, phone, email, password
        self.user_ws.append_row([name, phone, email, hashed])
        return True

    def authenticate_user(self, email: str, password: str) -> bool:
        user = self.get_user(email)
        if not user:
            return False
        stored = (
            user.get("hashed_password")
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
        
        if settings.USE_POSTGRES and not self.is_mock:
            with get_db_cursor(commit=True) as cur:
                cur.execute(
                    "UPDATE trackspense.users SET password_hash = %s WHERE email = %s",
                    (hashed, email)
                )
            return True
        
        # Find the user's row index
        cell = self.user_ws.find(email)
        if not cell:
            return False

        # Update the password in the same row. Assuming password is in the 4th column (D)
        self.user_ws.update_cell(cell.row, 4, hashed)
        return True

    def update_profile(self, email: str, name: Optional[str] = None, phone: Optional[str] = None) -> bool:
        """Update the user's profile fields in the sheet or db."""
        user = self.get_user(email)
        if not user:
            return False
            
        if settings.USE_POSTGRES and not self.is_mock:
            with get_db_cursor(commit=True) as cur:
                if name is not None:
                    cur.execute("UPDATE trackspense.users SET name = %s WHERE email = %s", (name, email))
                if phone is not None:
                    cur.execute("UPDATE trackspense.users SET phone = %s WHERE email = %s", (phone, email))
            return True
            
        cell = self.user_ws.find(email)
        if not cell:
            return False
        if name is not None:
            self.user_ws.update_cell(cell.row, 1, name)
        if phone is not None:
            self.user_ws.update_cell(cell.row, 2, phone)
        return True

    def revoke_refresh_token(self, token: str) -> None:
        _REVOKED_REFRESH_TOKENS.add(token)

    def is_refresh_token_revoked(self, token: str) -> bool:
        return token in _REVOKED_REFRESH_TOKENS
