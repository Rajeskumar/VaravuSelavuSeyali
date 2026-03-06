import hashlib
from typing import Optional

from varavu_selavu_service.db.google_sheets import GoogleSheetsClient
from varavu_selavu_service.core.config import Settings
import psycopg2

settings = Settings()

if settings.USE_POSTGRES:
    from varavu_selavu_service.db.postgres import get_db_cursor


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


class AuthService:
    def __init__(self, gs_client: Optional[GoogleSheetsClient] = None):
        self.gs = gs_client or GoogleSheetsClient()
        self.user_ws = self.gs.user_data_sheet()

    def login(self, email: str, password: str) -> bool:
        hashed = hash_password(password)
        
        if settings.USE_POSTGRES:
            with get_db_cursor() as cur:
                cur.execute(
                    "SELECT email FROM trackspense.users WHERE email = %s AND password_hash = %s",
                    (email, hashed)
                )
                return bool(cur.fetchone())
                
        records = self.user_ws.get_all_records()
        user = next((u for u in records if u.get("Email") == email and u.get("Password") == hashed), None)
        return user is not None

    def register(self, name: str, email: str, phone: str, password: str) -> bool:
        hashed = hash_password(password)
        
        if settings.USE_POSTGRES:
            with get_db_cursor(commit=True) as cur:
                try:
                    cur.execute(
                        """
                        INSERT INTO trackspense.users (email, name, phone, password_hash)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (email, name, phone, hashed)
                    )
                    return True
                except psycopg2.IntegrityError:
                    return False
        
        records = self.user_ws.get_all_records()
        if any(u.get("Email") == email for u in records):
            return False
        self.user_ws.append_row([name, email, phone, hashed])
        return True
