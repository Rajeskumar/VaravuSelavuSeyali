from typing import List, Dict, Optional, Union
from datetime import date as date_type
import warnings

import pandas as pd

from varavu_selavu_service.db.google_sheets import GoogleSheetsClient


class ExpenseService:
    def __init__(self, gs_client: Optional[GoogleSheetsClient] = None):
        self.gs = gs_client or GoogleSheetsClient()
        self.expense_ws = self.gs.main_worksheet()

    def add_expense(self, user_id: str, date: Union[str, date_type], description: str, category: str, cost: float) -> Dict:
        # Ensure we write a string date in ISO format (YYYY-MM-DD)
        date_str = date.isoformat() if isinstance(date, date_type) else str(date)
        new_row = [user_id, date_str, description, category, cost]
        self.expense_ws.append_row(new_row)
        return {
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
        }

    def get_expenses_for_user(self, user_id: str) -> List[Dict]:
        all_expenses = self.expense_ws.get_all_records()
        return [e for e in all_expenses if e.get("User ID") == user_id]

    def load_dataframe(self) -> pd.DataFrame:
        df = pd.DataFrame(self.expense_ws.get_all_records())
        if df.empty:
            return df
        # Normalize columns expected by old implementation
        if "date" in df.columns:
            # Prefer explicit format used by the app (YYYY-MM-DD) to avoid inference warnings
            parsed = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="coerce")
            # Fallback: try general parsing (and dayfirst) for any legacy/misc rows
            missing_mask = parsed.isna()
            if missing_mask.any():
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", category=UserWarning)
                    parsed.loc[missing_mask] = pd.to_datetime(df.loc[missing_mask, "date"], errors="coerce")
                # Second fallback with dayfirst for DD/MM/YYYY
                missing_mask = parsed.isna()
                if missing_mask.any():
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore", category=UserWarning)
                        parsed.loc[missing_mask] = pd.to_datetime(df.loc[missing_mask, "date"], errors="coerce", dayfirst=True)
            df["date"] = parsed
        if "cost" in df.columns:
            df["cost"] = pd.to_numeric(df["cost"], errors="coerce")
        return df
