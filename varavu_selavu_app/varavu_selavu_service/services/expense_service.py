from typing import List, Dict, Optional, Union
from datetime import date as date_type
from datetime import datetime
import uuid

from sqlalchemy.orm import Session
from varavu_selavu_service.db.models import Expense

class ExpenseService:
    def __init__(self, db: Session):
        self.db = db

    def add_expense(self, user_id: str, date: Union[str, date_type], description: str, category: str, cost: float, merchant_name: Optional[str] = None) -> Dict:
        if isinstance(date, date_type):
            date_str = date.strftime("%m/%d/%Y")
        else:
            try:
                parsed = datetime.strptime(str(date), "%Y-%m-%d")
                date_str = parsed.strftime("%m/%d/%Y")
            except ValueError:
                date_str = str(date)

        new_id = uuid.uuid4()
        purchased_at = datetime.strptime(date_str, "%m/%d/%Y")
        
        db_expense = Expense(
            id=new_id,
            user_email=user_id,
            purchased_at=purchased_at,
            category_id=category,
            amount=cost,
            description=description,
            merchant_name=merchant_name,
        )
        self.db.add(db_expense)
        self.db.commit()
        
        return {
            "row_id": str(new_id),
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
            "merchant_name": merchant_name,
        }

    def delete_expense(self, row_id: Union[int, str]) -> Optional[Dict]:
        try:
            parsed_id = uuid.UUID(str(row_id))
        except ValueError:
            parsed_id = row_id # Fallback if someone passed an int ID before migrations
        
        expense = self.db.query(Expense).filter(Expense.id == parsed_id).first()
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
        expenses = self.db.query(Expense).filter(Expense.user_email == user_id).order_by(Expense.purchased_at.desc()).all()
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
    ) -> tuple[Dict, Optional[Dict]]:
        if isinstance(date, date_type):
            date_str = date.strftime("%m/%d/%Y")
        else:
            try:
                parsed = datetime.strptime(str(date), "%Y-%m-%d")
                date_str = parsed.strftime("%m/%d/%Y")
            except ValueError:
                date_str = str(date)
                
        purchased_at = datetime.strptime(date_str, "%m/%d/%Y")
        
        try:
            parsed_id = uuid.UUID(str(row_id))
        except ValueError:
            parsed_id = row_id
        
        expense = self.db.query(Expense).filter(Expense.id == parsed_id, Expense.user_email == user_id).first()
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
            self.db.commit()
            
        return {
            "row_id": str(row_id),
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
            "merchant_name": merchant_name,
        }, old_expense_data
