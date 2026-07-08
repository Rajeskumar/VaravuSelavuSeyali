import csv
import io
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, GroupMember, Settlement
from varavu_selavu_service.services.group_service import GroupService


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class GroupExportService:
    """TS-GRP-132: one CSV per group, discriminated by a `record_type` column
    (expense|settlement) so it imports cleanly into any spreadsheet tool."""

    def __init__(self, db: Session):
        self.db = db
        self.group_service = GroupService(db)

    def export_csv(self, group_id: str, actor_email: str) -> str:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)

        members = {m.id: m for m in self.db.query(GroupMember).filter(GroupMember.group_id == gid).all()}

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "record_type", "date", "description_or_note", "category", "amount", "currency",
            "from_or_payer", "to_or_participant", "method",
        ])

        expenses = (
            self.db.query(Expense).filter(Expense.group_id == gid).order_by(Expense.purchased_at.asc()).all()
        )
        for e in expenses:
            payers = self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == e.id).all()
            payer_names = ", ".join(
                f"{members[p.member_id].display_name} (${float(p.amount_paid):.2f})"
                for p in payers if p.member_id in members
            )
            splits = self.db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == e.id).all()
            split_names = ", ".join(
                f"{members[s.member_id].display_name} (${float(s.amount_owed):.2f})"
                for s in splits if s.member_id in members
            )
            writer.writerow([
                "expense",
                e.purchased_at.strftime("%m/%d/%Y") if e.purchased_at else "",
                e.description or "",
                e.category_id or "",
                float(e.amount or 0),
                e.currency or "USD",
                payer_names,
                split_names,
                "",
            ])

        settlements = (
            self.db.query(Settlement).filter(Settlement.group_id == gid).order_by(Settlement.settled_at.asc()).all()
        )
        for s in settlements:
            from_name = members[s.from_member_id].display_name if s.from_member_id in members else "Unknown"
            to_name = members[s.to_member_id].display_name if s.to_member_id in members else "Unknown"
            writer.writerow([
                "settlement",
                s.settled_at.strftime("%m/%d/%Y") if s.settled_at else "",
                s.notes or "",
                "",
                float(s.amount or 0),
                "",
                from_name,
                to_name,
                s.method or "",
            ])

        # UTF-8 BOM so Excel-on-Windows opens it without mangling non-ASCII names.
        return "﻿" + buf.getvalue()
