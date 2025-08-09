import hashlib
from typing import Optional

from varavu_selavu_service.db.google_sheets import GoogleSheetsClient


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


class AuthService:
    def __init__(self, gs_client: Optional[GoogleSheetsClient] = None):
        self.gs = gs_client or GoogleSheetsClient()
        self.user_ws = self.gs.user_data_sheet()

    def login(self, email: str, password: str) -> bool:
        records = self.user_ws.get_all_records()
        hashed = hash_password(password)
        user = next((u for u in records if u.get("Email") == email and u.get("Password") == hashed), None)
        return user is not None

    def register(self, name: str, email: str, phone: str, password: str) -> bool:
        records = self.user_ws.get_all_records()
        if any(u.get("Email") == email for u in records):
            return False
        self.user_ws.append_row([name, email, phone, hash_password(password)])
        return True
