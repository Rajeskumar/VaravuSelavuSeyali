import uuid
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from varavu_selavu_service.db.postgres import get_db_cursor

class PostgresRepo:
    """Repository for reading/writing expenses to PostgreSQL, mirroring SheetsRepo interface."""

    def find_expense_by_fingerprint(self, user_email: str, fingerprint: str) -> Optional[Dict[str, Any]]:
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM trackspense.expenses
                WHERE user_email = %s AND fingerprint = %s
                LIMIT 1
                """,
                (user_email, fingerprint)
            )
            row = cur.fetchone()
            if row:
                # Convert dates/Decimals to match dict expectations of caller
                res = dict(row)
                res["id"] = str(res["id"])
                res["amount"] = float(res["amount"])
                return res
            return None

    def append_expense(self, header: Dict[str, Any]) -> str:
        expense_id = str(uuid.uuid4())
        
        # map incoming header to postgres columns
        email = header.get("user_email")
        purchased_at = header.get("purchased_at")
        merchant_name = header.get("merchant_name")
        merchant_id = header.get("merchant_id")
        
        # Sheets currently passes category name in 'category_name', postgres uses 'category_id'
        cat_id = header.get("category_name") or header.get("category_id") or "Uncategorized"
        
        amount = header.get("amount", 0.0)
        currency = header.get("currency", "USD")
        tax = header.get("tax", 0.0)
        tip = header.get("tip", 0.0)
        discount = header.get("discount", 0.0)
        payment_method = header.get("payment_method")
        description = header.get("description")
        notes = header.get("notes")
        fingerprint = header.get("fingerprint")

        with get_db_cursor(commit=True) as cur:
            cur.execute(
                """
                INSERT INTO trackspense.expenses 
                (id, user_email, purchased_at, merchant_name, merchant_id, category_id,
                 amount, currency, tax, tip, discount, payment_method, description,
                 notes, fingerprint)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (expense_id, email, purchased_at, merchant_name, merchant_id, cat_id,
                 amount, currency, tax, tip, discount, payment_method, description,
                 notes, fingerprint)
            )
        return expense_id

    def delete_expense(self, expense_id: str) -> None:
        # Note: legacy SheetsRepo delete_expense takes `id`, but `ExpenseService.delete_expense` takes `row_id`.
        # API Routes currently deletes by `row_id` through ExpenseService. 
        # When removing receipts API calls delete_expense by item fingerprint. 
        # Since Postgres handles cascade delete from the UUID automatically, 
        # we just delete the expense record directly if it's a UUID.
        try:
            uuid.UUID(str(expense_id))
            is_uuid = True
        except ValueError:
            is_uuid = False
        
        with get_db_cursor(commit=True) as cur:
            if is_uuid:
                cur.execute("DELETE FROM trackspense.expenses WHERE id = %s", (expense_id,))
            else:
                # If a legacy `row_id` integer was accidentally passed down: we cannot easily map row_id.
                # It is handled via services, so this method is mostly for receipt rollback
                pass

    def append_items(self, user_email: str, expense_id: str, items: List[Dict[str, Any]]) -> List[str]:
        ids = []
        data = []
        for item in items:
            item_id = str(uuid.uuid4())
            ids.append(item_id)
            
            line_no = item.get("line_no", 1)
            item_name = item.get("item_name", "Unknown Item")
            normalized_name = item.get("normalized_name")
            category_id = item.get("category_id") or item.get("category_name")
            quantity = item.get("quantity")
            unit = item.get("unit")
            unit_price = item.get("unit_price")
            line_total = float(item.get("line_total", 0.0))
            tax = float(item.get("tax", 0.0))
            discount = float(item.get("discount", 0.0))
            attr_json = item.get("attributes_json")
            if attr_json and isinstance(attr_json, dict):
                attr_json = json.dumps(attr_json)
                
            data.append((
                item_id, expense_id, user_email, line_no, item_name, normalized_name,
                category_id, quantity, unit, unit_price, line_total, tax, discount, attr_json
            ))

        with get_db_cursor(commit=True) as cur:
            from psycopg2.extras import execute_values
            execute_values(
                cur,
                """
                INSERT INTO trackspense.expense_items
                (id, expense_id, user_email, line_no, item_name, normalized_name,
                 category_id, quantity, unit, unit_price, line_total, tax, discount,
                 attributes_json)
                VALUES %s
                """,
                data
            )
        return ids
