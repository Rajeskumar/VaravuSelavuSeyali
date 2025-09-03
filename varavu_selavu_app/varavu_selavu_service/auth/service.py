from typing import Optional

from varavu_selavu_service.db.google_sheets import GoogleSheetsClient
from .security import hash_password, verify_password

# simple in-memory store for revoked refresh tokens
_REVOKED_REFRESH_TOKENS: set[str] = set()


class AuthService:
    def __init__(self, user_ws=None):
        if user_ws is None:
            gs = GoogleSheetsClient()
            # use existing `user_data` sheet for user credentials
            self.user_ws = gs.user_data_sheet()
        else:
            self.user_ws = user_ws

    def _all_users(self):
        return self.user_ws.get_all_records()

    def get_user(self, email: str) -> Optional[dict]:
        records = self._all_users()
        return next(
            (u for u in records if (u.get("email") or u.get("Email")) == email),
            None,
        )

    def register_user(self, name: str, phone: str, email: str, password: str) -> bool:
        if self.get_user(email):
            return False
        hashed = hash_password(password)
        # user_data sheet columns: name, phone, email, password
        self.user_ws.append_row([name, email, phone, hashed])
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
        
        # Find the user's row index
        cell = self.user_ws.find(email)
        if not cell:
            return False

        hashed = hash_password(password)
        # Update the password in the same row. Assuming password is in the 4th column (D)
        self.user_ws.update_cell(cell.row, 4, hashed)
        return True

    def update_profile(self, email: str, name: Optional[str] = None, phone: Optional[str] = None) -> bool:
        """Update the user's profile fields in the sheet.

        Columns (1-based):
        1: name, 2: phone, 3: email, 4: password
        """
        user = self.get_user(email)
        if not user:
            return False
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
