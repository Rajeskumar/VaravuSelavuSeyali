from typing import List, Dict, Optional, Union
from datetime import date as date_type
from datetime import datetime

import pandas as pd

from varavu_selavu_service.db.google_sheets import GoogleSheetsClient


class ExpenseService:
    def __init__(self, gs_client: Optional[GoogleSheetsClient] = None):
        self.gs = gs_client or GoogleSheetsClient()
        self.expense_ws = self.gs.main_worksheet()

    def add_expense(self, user_id: str, date: Union[str, date_type], description: str, category: str, cost: float) -> Dict:
        # Store dates in MM/DD/YYYY format
        if isinstance(date, date_type):
            date_str = date.strftime("%m/%d/%Y")
        else:
            try:
                parsed = datetime.strptime(str(date), "%Y-%m-%d")
                date_str = parsed.strftime("%m/%d/%Y")
            except ValueError:
                date_str = str(date)
        new_row = [user_id, date_str, description, category, cost]
        self.expense_ws.append_row(new_row)
        return {
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
        }

    def delete_expense(self, row_id: int) -> None:
        """Delete an expense by spreadsheet row id."""
        self.expense_ws.delete_rows(row_id)

    def get_expenses_for_user(self, user_id: str) -> List[Dict]:
        """Return all expenses for a user along with the row id for editing."""
        records = self.expense_ws.get_all_records()
        results: List[Dict] = []
        for idx, row in enumerate(records, start=2):  # sheet rows start at 1 with header
            if row.get("User ID") != user_id:
                continue

            raw_date = row.get("date")
            parsed = pd.to_datetime(raw_date, format="%m/%d/%Y", errors="coerce")
            if pd.isna(parsed):
                continue

            results.append(
                {
                    "row_id": idx,
                    "user_id": user_id,
                    "date": parsed.strftime("%m/%d/%Y"),
                    "description": row.get("description"),
                    "category": row.get("category"),
                    "cost": float(row.get("cost", 0)),
                }
            )
        return results

    def update_expense(
        self,
        row_id: int,
        user_id: str,
        date: Union[str, date_type],
        description: str,
        category: str,
        cost: float,
    ) -> Dict:
        """Update an existing expense by spreadsheet row id."""
        if isinstance(date, date_type):
            date_str = date.strftime("%m/%d/%Y")
        else:
            try:
                parsed = datetime.strptime(str(date), "%Y-%m-%d")
                date_str = parsed.strftime("%m/%d/%Y")
            except ValueError:
                date_str = str(date)
        values = [[user_id, date_str, description, category, cost]]
        cell_range = f"A{row_id}:E{row_id}"
        self.expense_ws.update(cell_range, values)
        return {
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
        }

    def load_dataframe(self) -> pd.DataFrame:
        df = pd.DataFrame(self.expense_ws.get_all_records())
        if df.empty:
            return df
        # Normalize columns expected by old implementation
        if "date" in df.columns:
            parsed = pd.to_datetime(df["date"], format="%m/%d/%Y", errors="coerce")
            df["date"] = parsed
        if "cost" in df.columns:
            df["cost"] = pd.to_numeric(df["cost"], errors="coerce")
        return df
