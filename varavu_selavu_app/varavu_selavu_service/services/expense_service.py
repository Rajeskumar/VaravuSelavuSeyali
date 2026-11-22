from typing import List, Dict, Optional, Union
from datetime import date as date_type
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException

from sqlalchemy import func
from varavu_selavu_service.core.expense_dates import assert_expense_date
from varavu_selavu_service.services.personal_write_lock import lock_personal_user, duplicate_fingerprint
from sqlalchemy.orm import Session
from varavu_selavu_service.db.models import Expense
from varavu_selavu_service.services.tag_service import get_tags_for_expenses
from varavu_selavu_service.services.card_service import get_card_refs_for_expenses

# Sentinel for update_expense's `notes`: an omitted field must leave existing notes alone, since
# not every client sends notes (the mobile app and the AI chat tools never do) and treating
# "absent" as "clear" would silently wipe notes whenever one of them edits the expense.
NOTES_UNCHANGED = object()


class ExpenseService:
    def __init__(self, db: Session):
        self.db = db

    def add_expense(
        self, user_id: str, date: Union[str, date_type], description: str, category: str, cost: float,
        merchant_name: Optional[str] = None, card_id: Optional[str] = None,
        notes: Optional[str] = None,
        commit: bool = True, source_connection_id: str | None = None, payment_method: str | None = None,
    ) -> Dict:
        lock_personal_user(self.db, user_id)
        if isinstance(date, date_type):
            date_str = date.strftime("%m/%d/%Y")
        else:
            try:
                parsed = datetime.strptime(str(date), "%Y-%m-%d")
                date_str = parsed.strftime("%m/%d/%Y")
            except ValueError:
                date_str = str(date)

        new_id = uuid.uuid4()
        purchased_at = datetime.strptime(date_str, "%m/%d/%Y").replace(hour=12, tzinfo=timezone.utc)
        
        db_expense = Expense(
            id=new_id,
            user_email=user_id,
            purchased_at=purchased_at,
            category_id=category,
            amount=cost,
            description=description,
            merchant_name=merchant_name,
            card_id=uuid.UUID(str(card_id)) if card_id else None,
            notes=notes,
            created_by_connection_id=source_connection_id,
            payment_method=payment_method,
            dup_fingerprint=duplicate_fingerprint("USD", cost, merchant_name, description),
        )
        self.db.add(db_expense)
        
        from varavu_selavu_service.db.models import ExpenseItem
        proxy_item = ExpenseItem(
            expense_id=new_id,
            user_email=user_id,
            line_no=1,
            item_name=description,
            normalized_name=description,
            category_id=category,
            quantity=1,
            unit="Item",
            unit_price=cost,
            line_total=cost,
        )
        self.db.add(proxy_item)
        self.db.flush()
        if commit:
            self.db.commit()
        
        return {
            "row_id": str(new_id),
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
            "merchant_name": merchant_name,
            "card_id": card_id,
            "notes": notes,
        }

    def delete_expense(self, row_id: Union[int, str], user_id: str) -> Optional[Dict]:
        try:
            parsed_id = uuid.UUID(str(row_id))
        except ValueError:
            # Expense ids are UUIDs. Falling back to querying with the raw string made
            # Postgres raise "invalid input syntax for type uuid" -> an unhandled 500; a
            # malformed id simply matches nothing (the route turns this into a 404).
            return None

        lock_personal_user(self.db, user_id)
        expense = self.db.query(Expense).filter(
            Expense.id == parsed_id, Expense.user_email == user_id, Expense.group_id.is_(None)
        ).first()
        if expense:
            deleted_data = {
                "user_email": expense.user_email,
                "merchant_name": expense.merchant_name,
                "amount": float(expense.amount),
                "purchased_at": expense.purchased_at,
            }
            # Fetch associated items so we can back them out too
            from varavu_selavu_service.db.models import ExpenseItem
            items = self.db.query(ExpenseItem).filter(ExpenseItem.expense_id == parsed_id).all()
            
            deleted_data["items"] = [
                {
                    "normalized_name": item.normalized_name or item.item_name,
                    "unit_price": float(item.unit_price or 0),
                    "quantity": float(item.quantity or 1),
                    "line_total": float(item.line_total or 0)
                } for item in items
            ]
            
            self.db.delete(expense)
            self.db.commit()
            return deleted_data
        return None

    def get_expenses_for_user(self, user_id: str) -> List[Dict]:
        expenses = self.db.query(Expense).filter(Expense.user_email == user_id, Expense.group_id.is_(None)).order_by(Expense.purchased_at.desc()).all()

        from varavu_selavu_service.db.models import ExpenseItem
        expense_ids = [r.id for r in expenses]
        item_counts: Dict[str, int] = {}
        if expense_ids:
            counts = (
                self.db.query(ExpenseItem.expense_id, func.count(ExpenseItem.id))
                .filter(ExpenseItem.expense_id.in_(expense_ids))
                .group_by(ExpenseItem.expense_id)
                .all()
            )
            item_counts = {str(expense_id): count for expense_id, count in counts}

        tags_by_expense = get_tags_for_expenses(self.db, expense_ids, user_id)
        card_refs = get_card_refs_for_expenses(self.db, [r.card_id for r in expenses])

        from varavu_selavu_service.db.mcp_models import MCPConnection
        connection_ids = {r.created_by_connection_id for r in expenses if r.created_by_connection_id}
        connection_names = {r.id: r.client_name for r in self.db.query(MCPConnection).filter(MCPConnection.id.in_(connection_ids)).all()} if connection_ids else {}
        results = []
        for r in expenses:
            dt = r.purchased_at
            date_str = dt.strftime("%m/%d/%Y") if dt else "01/01/1970"
            results.append({
                "row_id": str(r.id),
                "created_by_assistant": connection_names.get(r.created_by_connection_id),
                "user_id": user_id,
                "date": date_str,
                "description": r.description or "",
                "category": r.category_id or "",
                "cost": float(r.amount or 0),
                "merchant_name": r.merchant_name,
                "notes": r.notes,
                "item_count": item_counts.get(str(r.id), 0),
                "split_type": r.split_type,
                "tags": tags_by_expense.get(str(r.id), []),
                "card": card_refs.get(str(r.card_id)) if r.card_id else None,
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
        merchant_name: Optional[str] = None,
        card_id: Optional[str] = None,
        notes=NOTES_UNCHANGED,
    ) -> tuple[Dict, Optional[Dict]]:
        if isinstance(date, date_type):
            date_str = date.strftime("%m/%d/%Y")
        else:
            try:
                parsed = datetime.strptime(str(date), "%Y-%m-%d")
                date_str = parsed.strftime("%m/%d/%Y")
            except ValueError:
                date_str = str(date)
                
        purchased_at = datetime.strptime(date_str, "%m/%d/%Y").replace(hour=12, tzinfo=timezone.utc)
        
        try:
            parsed_id = uuid.UUID(str(row_id))
        except ValueError:
            # See delete_expense: a malformed id matches nothing, rather than a DB-level 500.
            raise HTTPException(status_code=404, detail="Expense not found")

        lock_personal_user(self.db, user_id)
        expense = self.db.query(Expense).filter(Expense.id == parsed_id, Expense.user_email == user_id, Expense.group_id.is_(None)).first()
        if expense is None:
            # The scoped lookup missing means the expense does not exist, belongs to someone
            # else, or is a group expense. Previously this fell straight through to the return
            # below and reported success while writing nothing -- a silent data loss that made
            # a real bug indistinguishable from a successful save. Matches delete_expense.
            raise HTTPException(status_code=404, detail="Expense not found")

        # Editing an older expense is fine as long as its date is left alone.
        assert_expense_date(date_str, check_past=not (expense.purchased_at and expense.purchased_at.date() == purchased_at.date()))

        old_expense_data = None
        if expense:
            old_expense_data = {
                "amount": float(expense.amount),
                "merchant_name": expense.merchant_name,
                "purchased_at": expense.purchased_at
            }
            expense.purchased_at = purchased_at
            expense.description = description
            expense.category_id = category
            expense.amount = cost
            expense.dup_fingerprint = duplicate_fingerprint(expense.currency, cost, merchant_name, description)
            expense.merchant_name = merchant_name
            expense.card_id = uuid.UUID(str(card_id)) if card_id else None
            if notes is not NOTES_UNCHANGED:
                expense.notes = notes

            from varavu_selavu_service.db.models import ExpenseItem
            items = self.db.query(ExpenseItem).filter(ExpenseItem.expense_id == parsed_id).all()
            if len(items) == 1:
                # If there's exactly one item, we assume it's our synthesized proxy (or a 1-item receipt). Keep it in sync.
                items[0].item_name = description
                items[0].normalized_name = description
                items[0].category_id = category
                items[0].unit_price = cost
                items[0].line_total = cost
            elif len(items) == 0:
                proxy_item = ExpenseItem(
                    expense_id=parsed_id,
                    user_email=user_id,
                    line_no=1,
                    item_name=description,
                    normalized_name=description,
                    category_id=category,
                    quantity=1,
                    unit="Item",
                    unit_price=cost,
                    line_total=cost,
                )
                self.db.add(proxy_item)

            self.db.commit()
            
        return {
            "row_id": str(row_id),
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
            "merchant_name": merchant_name,
            "card_id": card_id,
            "notes": expense.notes,
        }, old_expense_data
