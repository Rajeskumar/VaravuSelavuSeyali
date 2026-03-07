import uuid
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session
from varavu_selavu_service.db.models import Expense, ExpenseItem

class PostgresRepo:
    """Repository for reading/writing expenses to PostgreSQL using SQLAlchemy."""
    
    def __init__(self, db: Session):
        self.db = db

    def find_expense_by_fingerprint(self, user_email: str, fingerprint: str) -> Optional[Dict[str, Any]]:
        expense = self.db.query(Expense).filter(
            Expense.user_email == user_email,
            Expense.fingerprint == fingerprint
        ).first()

        if expense:
            return {
                "id": str(expense.id),
                "user_email": expense.user_email,
                "purchased_at": expense.purchased_at,
                "merchant_name": expense.merchant_name,
                "merchant_id": expense.merchant_id,
                "category_id": expense.category_id,
                "amount": float(expense.amount) if expense.amount else 0.0,
                "currency": expense.currency,
                "tax": float(expense.tax) if expense.tax else 0.0,
                "tip": float(expense.tip) if expense.tip else 0.0,
                "discount": float(expense.discount) if expense.discount else 0.0,
                "payment_method": expense.payment_method,
                "description": expense.description,
                "notes": expense.notes,
                "fingerprint": expense.fingerprint,
                "created_at": expense.created_at,
            }
        return None

    def append_expense(self, header: Dict[str, Any]) -> str:
        expense_id = str(uuid.uuid4())
        
        email = header.get("user_email")
        purchased_at = header.get("purchased_at")
        merchant_name = header.get("merchant_name")
        merchant_id = header.get("merchant_id")
        
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
        
        has_purchased_tz = False
        if isinstance(purchased_at, str):
            try:
                purchased_at = datetime.fromisoformat(purchased_at.replace("Z", "+00:00"))
                has_purchased_tz = True
            except ValueError:
                pass

        if not has_purchased_tz and isinstance(purchased_at, datetime) and purchased_at.tzinfo is None:
            purchased_at = purchased_at.replace(tzinfo=timezone.utc)

        expense = Expense(
            id=uuid.UUID(expense_id),
            user_email=email,
            purchased_at=purchased_at,
            merchant_name=merchant_name,
            merchant_id=merchant_id,
            category_id=cat_id,
            amount=amount,
            currency=currency,
            tax=tax,
            tip=tip,
            discount=discount,
            payment_method=payment_method,
            description=description,
            notes=notes,
            fingerprint=fingerprint
        )
        self.db.add(expense)
        self.db.commit()
        return expense_id

    def delete_expense(self, expense_id: str) -> None:
        try:
            parsed_id = uuid.UUID(str(expense_id))
        except ValueError:
            return

        expense = self.db.query(Expense).filter(Expense.id == parsed_id).first()
        if expense:
            self.db.delete(expense)
            self.db.commit()

    def append_items(self, user_email: str, expense_id: str, items: List[Dict[str, Any]]) -> List[str]:
        ids = []
        db_items = []
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
                
            db_item = ExpenseItem(
                id=uuid.UUID(item_id),
                expense_id=uuid.UUID(str(expense_id)),
                user_email=user_email,
                line_no=line_no,
                item_name=item_name,
                normalized_name=normalized_name,
                category_id=category_id,
                quantity=quantity,
                unit=unit,
                unit_price=unit_price,
                line_total=line_total,
                tax=tax,
                discount=discount,
                attributes_json=attr_json
            )
            db_items.append(db_item)

        self.db.add_all(db_items)
        self.db.commit()
        return ids
