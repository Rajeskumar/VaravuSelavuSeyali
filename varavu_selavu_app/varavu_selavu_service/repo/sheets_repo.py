import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import gspread

from varavu_selavu_service.db.google_sheets import GoogleSheetsClient

EXPENSES_SHEET = "expenses"
EXPENSE_ITEMS_SHEET = "expense_items"

EXPENSES_COLUMNS = [
    "id",
    "user_email",
    "purchased_at",
    "merchant_name",
    "merchant_id",
    "category_id",
    "amount",
    "currency",
    "tax",
    "tip",
    "discount",
    "payment_method",
    "description",
    "notes",
    "fingerprint",
    "created_at",
]

EXPENSE_ITEM_COLUMNS = [
    "id",
    "user_email",
    "expense_id",
    "line_no",
    "item_name",
    "normalized_name",
    "category_id",
    "quantity",
    "unit",
    "unit_price",
    "line_total",
    "tax",
    "discount",
    "attributes_json",
    "created_at",
]


def _iso_now() -> str:
    return datetime.utcnow().replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


class SheetsRepo:
    """Lightweight repository for reading/writing expenses to Google Sheets."""

    def __init__(self, client: Optional[GoogleSheetsClient] = None):
        self.gs = client or GoogleSheetsClient()
        self._ensure_tabs()

    def _ensure_tabs(self) -> None:
        sh = self.gs.spreadsheet
        for title, cols in (
            (EXPENSES_SHEET, EXPENSES_COLUMNS),
            (EXPENSE_ITEMS_SHEET, EXPENSE_ITEM_COLUMNS),
        ):
            try:
                ws = sh.worksheet(title)
            except gspread.exceptions.WorksheetNotFound:
                ws = sh.add_worksheet(title=title, rows="1", cols=str(len(cols)))
                ws.append_row(cols)
                continue
            header = ws.row_values(1)
            if header != cols:
                if header:
                    ws.delete_rows(1)
                ws.insert_row(cols, 1)

    def find_expense_by_fingerprint(self, user_email: str, fingerprint: str) -> Optional[Dict[str, Any]]:
        ws = self.gs.spreadsheet.worksheet(EXPENSES_SHEET)
        for row in ws.get_all_records():
            if row.get("user_email") == user_email and row.get("fingerprint") == fingerprint:
                return row
        return None

    def append_expense(self, header: Dict[str, Any]) -> str:
        ws = self.gs.spreadsheet.worksheet(EXPENSES_SHEET)
        expense_id = str(uuid.uuid4())
        row = {**header}
        row.update({"id": expense_id, "created_at": _iso_now()})
        values = [row.get(col, "") for col in EXPENSES_COLUMNS]
        ws.append_row(values)
        return expense_id

    def delete_expense(self, expense_id: str) -> None:
        ws = self.gs.spreadsheet.worksheet(EXPENSES_SHEET)
        records = ws.get_all_records()
        for idx, row in enumerate(records, start=2):
            if row.get("id") == expense_id:
                ws.delete_rows(idx)
                break

    def append_items(self, user_email: str, expense_id: str, items: List[Dict[str, Any]]) -> List[str]:
        ws = self.gs.spreadsheet.worksheet(EXPENSE_ITEMS_SHEET)
        ids = []
        rows = []
        for item in items:
            item_id = str(uuid.uuid4())
            full = {**item}
            full.update(
                {
                    "id": item_id,
                    "user_email": user_email,
                    "expense_id": expense_id,
                    "created_at": _iso_now(),
                }
            )
            rows.append([full.get(col, "") for col in EXPENSE_ITEM_COLUMNS])
            ids.append(item_id)
        for row in rows:
            ws.append_row(row)
        return ids
