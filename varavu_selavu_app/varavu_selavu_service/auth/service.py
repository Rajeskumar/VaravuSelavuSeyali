from datetime import datetime
from typing import Optional

from varavu_selavu_service.db.google_sheets import GoogleSheetsClient
from .security import hash_password, verify_password

# simple in-memory store for revoked refresh tokens
_REVOKED_REFRESH_TOKENS: set[str] = set()


class AuthService:
    def __init__(self, user_ws=None):
        if user_ws is None:
            gs = GoogleSheetsClient()
            # use a dedicated users sheet
            self.user_ws = gs.users_sheet()
        else:
            self.user_ws = user_ws

    def _all_users(self):
        return self.user_ws.get_all_records()

    def get_user(self, email: str) -> Optional[dict]:
        records = self._all_users()
        return next((u for u in records if u.get("email") == email), None)

    def register_user(self, email: str, password: str) -> bool:
        if self.get_user(email):
            return False
        hashed = hash_password(password)
        self.user_ws.append_row([email, hashed, datetime.utcnow().isoformat()])
        return True

    def authenticate_user(self, email: str, password: str) -> bool:
        user = self.get_user(email)
        if not user:
            return False
        return verify_password(password, user.get("hashed_password") or user.get("Password"))

    def revoke_refresh_token(self, token: str) -> None:
        _REVOKED_REFRESH_TOKENS.add(token)

    def is_refresh_token_revoked(self, token: str) -> bool:
        return token in _REVOKED_REFRESH_TOKENS

