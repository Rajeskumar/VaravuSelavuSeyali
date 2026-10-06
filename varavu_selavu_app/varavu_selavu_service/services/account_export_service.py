"""Everything TrackSpense holds about one user, as a single JSON document ("Download my data").

The per-screen CSV export covers expenses only. This is the portability counterpart to account
deletion: profile, personal expenses with their receipt line items, the user's share of every
group expense, budgets, recurring templates, cards and tags. It never includes the password hash,
tokens, or other people's private data (group rows carry only the caller's own share).
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import (
    Budget,
    CardCatalog,
    Expense,
    ExpenseItem,
    RecurringTemplate,
    Tag,
    User,
    UserCard,
)
from varavu_selavu_service.services.personal_export_service import PersonalExportService


def _plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if hasattr(value, "hex") and not isinstance(value, (str, bytes)):  # uuid.UUID
        return str(value)
    return value


class AccountExportService:
    def __init__(self, db: Session):
        self.db = db

    def build(self, email: str) -> Dict[str, Any]:
        user = self.db.query(User).filter(User.email == email).first()
        profile = {
            "email": email,
            "name": getattr(user, "name", None),
            "phone": getattr(user, "phone", None),
            "address": getattr(user, "address", None),
            "venmo_handle": getattr(user, "venmo_handle", None),
            "paypal_handle": getattr(user, "paypal_handle", None),
            "upi_id": getattr(user, "upi_id", None),
            "created_at": _plain(getattr(user, "created_at", None)),
            "email_verified": bool(getattr(user, "email_verified", False)),
        }

        expenses: List[Dict[str, Any]] = []
        rows = (
            self.db.query(Expense)
            .filter(Expense.user_email == email, Expense.group_id.is_(None))
            .order_by(Expense.purchased_at.desc())
            .all()
        )
        items_by_expense: Dict[Any, List[Dict[str, Any]]] = {}
        if rows:
            for it in self.db.query(ExpenseItem).filter(ExpenseItem.expense_id.in_([r.id for r in rows])).order_by(ExpenseItem.line_no).all():
                items_by_expense.setdefault(it.expense_id, []).append({
                    "name": it.item_name,
                    "quantity": _plain(it.quantity),
                    "unit_price": _plain(it.unit_price),
                    "line_total": _plain(it.line_total),
                    "category": it.category_id,
                })
        for r in rows:
            expenses.append({
                "date": _plain(r.purchased_at),
                "description": r.description,
                "merchant": r.merchant_name,
                "category": r.category_id,
                "amount": _plain(r.amount),
                "currency": r.currency,
                "tax": _plain(r.tax),
                "tip": _plain(r.tip),
                "discount": _plain(r.discount),
                "payment_method": r.payment_method,
                "notes": r.notes,
                "items": items_by_expense.get(r.id, []),
            })

        group_shares = PersonalExportService(self.db)._group_share_rows(email)

        budgets = [
            {
                "scope": b.scope, "target_type": b.target_type, "category": b.category,
                "amount": _plain(b.amount), "currency": b.currency, "period_type": b.period_type,
                "rollover": b.rollover, "muted": b.muted,
            }
            for b in self.db.query(Budget).filter(Budget.user_email == email, Budget.deleted_at.is_(None)).all()
        ]
        recurring = [
            {
                "description": t.description, "category": t.category, "merchant": t.merchant_name,
                "day_of_month": t.day_of_month, "amount": _plain(t.default_cost),
                "start_date": _plain(t.start_date), "status": t.status, "group_id": _plain(t.group_id),
            }
            for t in self.db.query(RecurringTemplate).filter(RecurringTemplate.user_email == email).all()
        ]
        cards = [
            {"issuer": c.issuer, "card_name": c.card_name, "is_default": uc.is_default}
            for uc, c in self.db.query(UserCard, CardCatalog).join(CardCatalog, CardCatalog.id == UserCard.card_id).filter(UserCard.user_email == email).all()
        ]
        tags = [t.name for t in self.db.query(Tag).filter(Tag.user_email == email).all()]

        return {
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "profile": profile,
            "personal_expenses": expenses,
            "group_expense_shares": [{k: _plain(v) for k, v in row.items()} for row in group_shares],
            "budgets": budgets,
            "recurring_templates": recurring,
            "cards": cards,
            "tags": tags,
            "note": "Group expenses appear as your share only. Other members' data, and group records created by others, are not included.",
        }
