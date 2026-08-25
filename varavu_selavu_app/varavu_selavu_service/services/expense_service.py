from typing import List, Dict, Optional, Union
from datetime import date as date_type
from datetime import datetime, timezone
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session
from varavu_selavu_service.db.models import Expense
from varavu_selavu_service.services.tag_service import get_tags_for_expenses
from varavu_selavu_service.services.card_service import get_card_refs_for_expenses

class ExpenseService:
    def __init__(self, db: Session):
        self.db = db

    def add_expense(
        self, user_id: str, date: Union[str, date_type], description: str, category: str, cost: float,
        merchant_name: Optional[str] = None, card_id: Optional[str] = None,
    ) -> Dict:
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
        }

    def delete_expense(self, row_id: Union[int, str]) -> Optional[Dict]:
        try:
            parsed_id = uuid.UUID(str(row_id))
        except ValueError:
            parsed_id = row_id # Fallback if someone passed an int ID before migrations
        
        expense = self.db.query(Expense).filter(Expense.id == parsed_id, Expense.group_id.is_(None)).first()
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

        results = []
        for r in expenses:
            dt = r.purchased_at
            date_str = dt.strftime("%m/%d/%Y") if dt else "01/01/1970"
            results.append({
                "row_id": str(r.id),
                "user_id": user_id,
                "date": date_str,
                "description": r.description or "",
                "category": r.category_id or "",
                "cost": float(r.amount or 0),
                "merchant_name": r.merchant_name,
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
            parsed_id = row_id
        
        expense = self.db.query(Expense).filter(Expense.id == parsed_id, Expense.user_email == user_id, Expense.group_id.is_(None)).first()
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
            expense.merchant_name = merchant_name
            expense.card_id = uuid.UUID(str(card_id)) if card_id else None

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
        }, old_expense_data
