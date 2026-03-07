from typing import List, Dict, Optional, Union
from datetime import date as date_type
from datetime import datetime
import uuid

from sqlalchemy.orm import Session
from varavu_selavu_service.db.models import Expense

class ExpenseService:
    def __init__(self, db: Session):
        self.db = db

    def add_expense(self, user_id: str, date: Union[str, date_type], description: str, category: str, cost: float) -> Dict:
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
            description=description
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
        }

    def delete_expense(self, row_id: Union[int, str]) -> None:
        try:
            parsed_id = uuid.UUID(str(row_id))
        except ValueError:
            parsed_id = row_id # Fallback if someone passed an int ID before migrations
        
        expense = self.db.query(Expense).filter(Expense.id == parsed_id).first()
        if expense:
            self.db.delete(expense)
            self.db.commit()

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
        if expense:
            expense.purchased_at = purchased_at
            expense.description = description
            expense.category_id = category
            expense.amount = cost
            self.db.commit()
            
        return {
            "row_id": str(row_id),
            "User ID": user_id,
            "date": date_str,
            "description": description,
            "category": category,
            "cost": cost,
        }
