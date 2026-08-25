import uuid
import json
from datetime import datetime, date, timezone
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

    @staticmethod
    def _normalize_purchased_at(value: Any) -> Optional[datetime]:
        """Anchor to noon UTC using only the calendar-date portion of ``value``.

        Any embedded time-of-day or UTC offset (e.g. from a client's
        ``Date.toISOString()``) is discarded rather than trusted, since it can
        encode a timezone-shifted calendar day rather than the day the user
        actually picked. Mirrors ExpenseService's noon-UTC anchor so a date can
        never roll across a UTC day boundary during storage.
        """
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.replace(hour=12, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
        if isinstance(value, date):
            return datetime(value.year, value.month, value.day, hour=12, tzinfo=timezone.utc)
        date_part = str(value).strip().split("T")[0]
        for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(date_part, fmt).replace(hour=12, tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

    def append_expense(self, header: Dict[str, Any]) -> str:
        expense_id = str(uuid.uuid4())
        
        email = header.get("user_email")
        purchased_at = header.get("purchased_at")
        merchant_name = header.get("merchant_name")

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
        card_id = header.get("card_id")

        purchased_at = self._normalize_purchased_at(purchased_at)

        expense = Expense(
            id=uuid.UUID(expense_id),
            user_email=email,
            purchased_at=purchased_at,
            merchant_name=merchant_name,
            category_id=cat_id,
            amount=amount,
            currency=currency,
            tax=tax,
            tip=tip,
            discount=discount,
            payment_method=payment_method,
            description=description,
            notes=notes,
            fingerprint=fingerprint,
            split_type=header.get("split_type"),
            card_id=uuid.UUID(str(card_id)) if card_id else None,
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

    def get_items_for_expense(self, expense_id: str) -> List[Dict[str, Any]]:
        try:
            parsed_id = uuid.UUID(str(expense_id))
        except ValueError:
            return []

        items = (
            self.db.query(ExpenseItem)
            .filter(ExpenseItem.expense_id == parsed_id)
            .order_by(ExpenseItem.line_no)
            .all()
        )
        return [
            {
                "id": str(item.id),
                "line_no": item.line_no,
                "item_name": item.item_name,
                "normalized_name": item.normalized_name,
                "category_id": item.category_id,
                "quantity": float(item.quantity) if item.quantity is not None else None,
                "unit": item.unit,
                "unit_price": float(item.unit_price) if item.unit_price is not None else None,
                "line_total": float(item.line_total) if item.line_total is not None else 0.0,
                "tax": float(item.tax) if item.tax is not None else 0.0,
                "discount": float(item.discount) if item.discount is not None else 0.0,
            }
            for item in items
        ]

    def delete_items_for_expense(self, expense_id: str) -> None:
        try:
            parsed_id = uuid.UUID(str(expense_id))
        except ValueError:
            return
        self.db.query(ExpenseItem).filter(ExpenseItem.expense_id == parsed_id).delete(synchronize_session=False)
