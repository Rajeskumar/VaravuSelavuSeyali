"""P2-5: "Export all my expenses" for the personal ledger.

The per-group export (GroupExportService) already existed; this is its personal
counterpart. Both route every cell through the same formula-injection guard.
"""

import csv
import io
from datetime import datetime
from typing import Optional

from decimal import Decimal

from sqlalchemy.orm import Session

from varavu_selavu_service.core.csv_safety import sanitize_csv_row
from varavu_selavu_service.db.models import Expense, ExpenseSplit, Group, GroupMember
from varavu_selavu_service.services.expense_service import ExpenseService


class PersonalExportService:
    def __init__(self, db: Session):
        self.db = db
        self.expense_service = ExpenseService(db)

    def export_csv(
        self,
        user_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> str:
        """CSV of the caller's whole ledger, newest first: personal expenses plus their share of
        every group expense (the landing page promises "your full ledger"; this used to be
        personal-only). Group rows carry the group's name and full amount in extra columns.

        `start_date`/`end_date` are inclusive MM/DD/YYYY bounds; omitting both
        exports everything.
        """
        rows = self.expense_service.get_expenses_for_user(user_id) + self._group_share_rows(user_id)

        def parse(value: str) -> Optional[datetime]:
            try:
                return datetime.strptime(value, "%m/%d/%Y")
            except (TypeError, ValueError):
                return None

        start = parse(start_date) if start_date else None
        end = parse(end_date) if end_date else None
        if start or end:
            filtered = []
            for row in rows:
                dt = parse(row.get("date", ""))
                if dt is None:
                    continue
                if start and dt < start:
                    continue
                if end and dt > end:
                    continue
                filtered.append(row)
            rows = filtered

        rows.sort(key=lambda r: parse(r.get("date", "")) or datetime.min, reverse=True)

        buf = io.StringIO()
        writer = csv.writer(buf)

        def write_row(row):
            writer.writerow(sanitize_csv_row(row))

        # The first six columns are unchanged so existing spreadsheets keep working.
        write_row(["date", "description", "category", "merchant", "amount", "item_count",
                   "group", "group_total", "tags", "notes", "card"])
        for r in rows:
            card = r.get("card") or {}
            write_row([
                r.get("date", ""),
                r.get("description", ""),
                r.get("category", ""),
                r.get("merchant_name") or "",
                _money(r.get("cost")),
                r.get("item_count", 0),
                r.get("group_name") or "",
                _money(r["group_total"]) if r.get("group_total") is not None else "",
                "; ".join(t.get("name", "") for t in (r.get("tags") or [])),
                r.get("notes") or "",
                card.get("card_name") or "",
            ])

        # UTF-8 BOM so Excel-on-Windows opens it without mangling non-ASCII text,
        # matching the group export.
        return "﻿" + buf.getvalue()

    def _group_share_rows(self, user_id: str) -> list:
        """One row per group expense the caller has a share in, at that share."""
        q = (
            self.db.query(Expense, ExpenseSplit.amount_owed, Group.name)
            .join(ExpenseSplit, ExpenseSplit.expense_id == Expense.id)
            .join(GroupMember, GroupMember.id == ExpenseSplit.member_id)
            .join(Group, Group.id == Expense.group_id)
            .filter(GroupMember.user_email == user_id, Expense.group_id.isnot(None), ExpenseSplit.amount_owed > 0)
        )
        return [
            {
                "date": e.purchased_at.strftime("%m/%d/%Y") if e.purchased_at else "",
                "description": e.description or "",
                "category": e.category_id or "",
                "merchant_name": e.merchant_name,
                "cost": share,
                "item_count": 0,
                "group_name": group_name,
                "group_total": e.amount,
                "notes": e.notes,
            }
            for e, share, group_name in q.all()
        ]


def _money(value) -> str:
    """Two decimal places, from Decimal (never float): "45.60", not "45.6"."""
    return str(Decimal(str(value or 0)).quantize(Decimal("0.01")))
