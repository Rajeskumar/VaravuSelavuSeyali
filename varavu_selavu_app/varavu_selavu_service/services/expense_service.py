from typing import List, Dict, Optional, Union
from datetime import date as date_type
from datetime import datetime
import uuid

import pandas as pd
import psycopg2

from varavu_selavu_service.db.postgres import get_db_cursor

class ExpenseService:
    def __init__(self):
        pass

    def add_expense(self, user_id: str, date: Union[str, date_type], description: str, category: str, cost: float) -> Dict:
        # Normalize date to MM/DD/YYYY for legacy output
        if isinstance(date, date_type):
            date_str = date.strftime("%m/%d/%Y")
        else:
            try:
                parsed = datetime.strptime(str(date), "%Y-%m-%d")
                date_str = parsed.strftime("%m/%d/%Y")
            except ValueError:
                date_str = str(date)

        new_id = str(uuid.uuid4())
        purchased_at = datetime.strptime(date_str, "%m/%d/%Y")
        with get_db_cursor(commit=True) as cur:
            cur.execute(
                """
                INSERT INTO trackspense.expenses 
                (id, user_email, purchased_at, category_id, amount, description)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (new_id, user_id, purchased_at, category, cost, description)
            )
        return {
            "row_id": new_id,
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
        }

    def delete_expense(self, row_id: Union[int, str]) -> None:
        """Delete an expense by id (UUID for postgres)."""
        with get_db_cursor(commit=True) as cur:
            cur.execute("DELETE FROM trackspense.expenses WHERE id = %s", (str(row_id),))

    def get_expenses_for_user(self, user_id: str) -> List[Dict]:
        """Return all expenses for a user along with the row id/uuid for editing."""
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT id, purchased_at, description, category_id, amount 
                FROM trackspense.expenses 
                WHERE user_email = %s 
                ORDER BY purchased_at DESC
                """,
                (user_id,)
            )
            rows = cur.fetchall()
            results = []
            for r in rows:
                dt = r["purchased_at"]
                # handle possible None dates gracefully
                date_str = dt.strftime("%m/%d/%Y") if dt else "01/01/1970"
                results.append({
                    "row_id": str(r["id"]),
                    "user_id": user_id,
                    "date": date_str,
                    "description": r["description"] or "",
                    "category": r["category_id"] or "",
                    "cost": float(r["amount"] or 0),
                })
            return results

    def update_expense(
        self,
        row_id: Union[int, str],
        user_id: str,
        date: Union[str, date_type],
        description: str,
        category: str,
        cost: float,
    ) -> Dict:
        """Update an existing expense by id (UUID)."""
        if isinstance(date, date_type):
            date_str = date.strftime("%m/%d/%Y")
        else:
            try:
                parsed = datetime.strptime(str(date), "%Y-%m-%d")
                date_str = parsed.strftime("%m/%d/%Y")
            except ValueError:
                date_str = str(date)
                
        purchased_at = datetime.strptime(date_str, "%m/%d/%Y")
        with get_db_cursor(commit=True) as cur:
            cur.execute(
                """
                UPDATE trackspense.expenses 
                SET purchased_at = %s, description = %s, category_id = %s, amount = %s
                WHERE id = %s AND user_email = %s
                """,
                (purchased_at, description, category, cost, str(row_id), user_id)
            )
            
        return {
            "row_id": row_id,
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
        }

    def load_dataframe(self) -> pd.DataFrame:
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT user_email as "User ID", purchased_at as "date", 
                       description, category_id as "category", amount as "cost"
                FROM trackspense.expenses
                """
            )
            rows = cur.fetchall()
            if not rows:
                return pd.DataFrame()
            df = pd.DataFrame(rows)
            # Ensure the same type conversions the old logic did so AnalysisService doesn't break
            df["date"] = pd.to_datetime(df["date"])
            df["cost"] = pd.to_numeric(df["cost"], errors="coerce")
            return df
