import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, GroupMember
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.split_engine import SplitError, resolve_split, validate_payers


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class GroupExpenseService:
    def __init__(self, db: Session):
        self.db = db
        self.group_service = GroupService(db)
        from varavu_selavu_service.services.activity_service import ActivityService
        self.activity_svc = ActivityService(db)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _parse_date(self, date_str: str) -> datetime:
        # Mirrors ExpenseService.add_expense's MM/DD/YYYY -> tz-aware UTC datetime
        # conversion exactly, so group and personal expense dates behave identically
        # (services/expense_service.py:13-24).
        return datetime.strptime(date_str, "%m/%d/%Y").replace(tzinfo=timezone.utc)

    def _validate_members_in_group(self, group_id: uuid.UUID, member_id_strs: set) -> None:
        if not member_id_strs:
            return
        mids = set()
        for s in member_id_strs:
            mid = _to_uuid(s)
            if mid is None:
                raise HTTPException(status_code=400, detail=f"Invalid member_id: {s}")
            mids.add(mid)
        found = (
            self.db.query(GroupMember.id)
            .filter(GroupMember.group_id == group_id, GroupMember.id.in_(mids))
            .all()
        )
        found_strs = {str(row[0]) for row in found}
        missing = member_id_strs - found_strs
        if missing:
            raise HTTPException(status_code=400, detail=f"member_id(s) not in this group: {sorted(missing)}")

    def _validate_and_resolve(self, group_id: uuid.UUID, amount: float, payers: List[dict], split_type: str, split_entries: List[dict]):
        payer_ids = [p["member_id"] for p in payers]
        if len(payer_ids) != len(set(payer_ids)):
            raise HTTPException(status_code=400, detail="Duplicate member_id in payers")
            
        entry_ids = [e["member_id"] for e in split_entries]
        if len(entry_ids) != len(set(entry_ids)):
            raise HTTPException(status_code=400, detail="Duplicate member_id in split entries")

        self._validate_members_in_group(group_id, set(payer_ids) | set(entry_ids))

        try:
            validate_payers(amount, payers)
            split_results = resolve_split(amount, split_type, split_entries)
        except SplitError as e:
            raise HTTPException(status_code=400, detail={"message": str(e), **e.details})

        return split_results

    def _expense_row(self, expense: Expense, actor_email: str) -> Dict:
        caller_member = self.group_service.get_member_by_email(expense.group_id, actor_email)
        my_share = 0.0
        if caller_member is not None:
            split = (
                self.db.query(ExpenseSplit)
                .filter(ExpenseSplit.expense_id == expense.id, ExpenseSplit.member_id == caller_member.id)
                .first()
            )
            if split is not None:
                my_share = float(split.amount_owed)

        payer_rows = self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == expense.id).all()
        payer_summary = [{"member_id": str(p.member_id), "amount_paid": float(p.amount_paid)} for p in payer_rows]

        return {
            "row_id": str(expense.id),
            "date": expense.purchased_at.strftime("%m/%d/%Y") if expense.purchased_at else "01/01/1970",
            "description": expense.description or "",
            "category": expense.category_id or "",
            "cost": float(expense.amount or 0),
            "merchant_name": expense.merchant_name,
            "my_share": my_share,
            "payer_summary": payer_summary,
        }

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def create_expense(
        self,
        group_id: str,
        actor_email: str,
        date: str,
        description: str,
        category: str,
        amount: float,
        merchant_name: Optional[str],
        payers: List[dict],
        split_type: str,
        split_entries: List[dict],
    ) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)

        split_results = self._validate_and_resolve(gid, amount, payers, split_type, split_entries)

        expense = Expense(
            id=uuid.uuid4(),
            user_email=actor_email,
            group_id=gid,
            split_type=split_type,
            purchased_at=self._parse_date(date),
            category_id=category,
            amount=amount,
            merchant_name=merchant_name,
            description=description,
        )
        self.db.add(expense)
        self.db.flush()

        for p in payers:
            self.db.add(
                ExpensePayer(
                    id=uuid.uuid4(),
                    expense_id=expense.id,
                    member_id=_to_uuid(p["member_id"]),
                    amount_paid=p["amount_paid"],
                )
            )
        for r in split_results:
            self.db.add(
                ExpenseSplit(
                    id=uuid.uuid4(),
                    expense_id=expense.id,
                    member_id=_to_uuid(r.member_id),
                    amount_owed=r.amount_owed,
                    basis_type=r.basis_type,
                    basis_value=r.basis_value,
                )
            )
        self.db.commit()
        
        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_created",
            entity_id=str(expense.id),
            payload={"description": expense.description, "amount": float(expense.amount)}
        )

        return self._expense_row(expense, actor_email)

    def list_group_expenses(self, group_id: str, actor_email: str, limit: int = 30, offset: int = 0) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)

        rows = self.db.query(Expense).filter(Expense.group_id == gid).order_by(Expense.purchased_at.desc()).all()
        total = len(rows)
        sliced = rows[offset : offset + limit]
        items = [self._expense_row(e, actor_email) for e in sliced]
        next_offset = offset + limit if offset + limit < total else None
        return {"items": items, "next_offset": next_offset}

    def update_expense(
        self,
        group_id: str,
        expense_id: str,
        actor_email: str,
        date: str,
        description: str,
        category: str,
        amount: float,
        merchant_name: Optional[str],
        payers: List[dict],
        split_type: str,
        split_entries: List[dict],
    ) -> Dict:
        # Any group member may edit any group expense (spec §5.2, decision §17.2).
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        eid = _to_uuid(expense_id)
        expense = (
            self.db.query(Expense).filter(Expense.id == eid, Expense.group_id == gid).first() if eid else None
        )
        if expense is None:
            raise HTTPException(status_code=404, detail="Group expense not found")

        split_results = self._validate_and_resolve(gid, amount, payers, split_type, split_entries)

        expense.purchased_at = self._parse_date(date)
        expense.description = description
        expense.category_id = category
        expense.amount = amount
        expense.merchant_name = merchant_name
        expense.split_type = split_type

        # Atomic rewrite: replace payers/splits (E2 — allowed even after a settlement;
        # no settlement is auto-modified).
        self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == expense.id).delete(synchronize_session=False)
        self.db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).delete(synchronize_session=False)

        for p in payers:
            self.db.add(
                ExpensePayer(
                    id=uuid.uuid4(),
                    expense_id=expense.id,
                    member_id=_to_uuid(p["member_id"]),
                    amount_paid=p["amount_paid"],
                )
            )
        for r in split_results:
            self.db.add(
                ExpenseSplit(
                    id=uuid.uuid4(),
                    expense_id=expense.id,
                    member_id=_to_uuid(r.member_id),
                    amount_owed=r.amount_owed,
                    basis_type=r.basis_type,
                    basis_value=r.basis_value,
                )
            )
        self.db.commit()
        
        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_updated",
            entity_id=str(expense.id),
            payload={"description": expense.description, "amount": float(expense.amount)}
        )

        return self._expense_row(expense, actor_email)

    def delete_expense(self, group_id: str, expense_id: str, actor_email: str) -> None:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        eid = _to_uuid(expense_id)
        expense = (
            self.db.query(Expense).filter(Expense.id == eid, Expense.group_id == gid).first() if eid else None
        )
        if expense is None:
            raise HTTPException(status_code=404, detail="Group expense not found")

        self.db.delete(expense)
        self.db.commit()
        
        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_deleted",
            entity_id=expense_id,
            payload={"description": expense.description}
        )
        # expense_payers/expense_splits cascade via the FK ondelete=CASCADE (TS-GRP-101).

    def create_itemized_expense(
        self,
        group_id: str,
        actor_email: str,
        date: str,
        description: str,
        category: str,
        amount: float,
        merchant_name: Optional[str],
        payers: List[dict],
        items: List[dict],
        fingerprint: Optional[str] = None
    ) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)

        payer_ids = [p["member_id"] for p in payers]
        if len(payer_ids) != len(set(payer_ids)):
            raise HTTPException(status_code=400, detail="Duplicate member_id in payers")
        
        # Verify payers exist in group
        self._validate_members_in_group(gid, set(payer_ids))

        try:
            validate_payers(amount, payers)
        except SplitError as e:
            raise HTTPException(status_code=400, detail={"message": str(e), **e.details})

        # Calculate totals from items to pass to item resolver
        tax = sum(i.get("tax", 0) for i in items)
        tip = 0 # Currently not passed in itemized structure, assumed handled via extra item or explicitly zero
        discount = sum(i.get("discount", 0) for i in items)

        # Ensure all referenced members exist
        item_members = set()
        for i in items:
            for mid in i.get("member_ratios", {}):
                item_members.add(mid)
        self._validate_members_in_group(gid, item_members)

        from varavu_selavu_service.services.item_split_engine import resolve_itemized_split
        
        try:
            split_results = resolve_itemized_split(items, tax=tax, tip=tip, discount=discount, total_amount=amount)
        except SplitError as e:
            raise HTTPException(status_code=400, detail={"message": str(e), **e.details})

        expense = Expense(
            id=uuid.uuid4(),
            user_email=actor_email,
            group_id=gid,
            split_type="itemized",
            purchased_at=self._parse_date(date),
            category_id=category,
            amount=amount,
            merchant_name=merchant_name,
            description=description,
            fingerprint=fingerprint
        )
        self.db.add(expense)
        self.db.flush()

        for p in payers:
            self.db.add(
                ExpensePayer(
                    id=uuid.uuid4(),
                    expense_id=expense.id,
                    member_id=_to_uuid(p["member_id"]),
                    amount_paid=p["amount_paid"],
                )
            )
            
        for r in split_results:
            self.db.add(
                ExpenseSplit(
                    id=uuid.uuid4(),
                    expense_id=expense.id,
                    member_id=_to_uuid(r.member_id),
                    amount_owed=r.amount_owed,
                    basis_type=r.basis_type,
                    basis_value=r.basis_value,
                )
            )
            
        from varavu_selavu_service.db.models import ExpenseItem, ExpenseItemSplit
        
        for item in items:
            expense_item = ExpenseItem(
                id=uuid.uuid4(),
                expense_id=expense.id,
                user_email=actor_email,
                line_no=item["line_no"],
                item_name=item["item_name"],
                normalized_name=item.get("normalized_name"),
                category_id=item.get("category_id"),
                quantity=item.get("quantity"),
                unit=item.get("unit"),
                unit_price=item.get("unit_price"),
                line_total=item["line_total"],
                tax=item.get("tax", 0),
                discount=item.get("discount", 0),
                attributes_json=item.get("attributes_json"),
            )
            self.db.add(expense_item)
            self.db.flush()
            
            # Record item splits
            for mid, ratio in item.get("member_ratios", {}).items():
                ratio_val = float(ratio)
                item_split = ExpenseItemSplit(
                    id=uuid.uuid4(),
                    expense_item_id=expense_item.id,
                    member_id=_to_uuid(mid),
                    ratio=ratio_val,
                    amount=item["line_total"] * ratio_val
                )
                self.db.add(item_split)

        self.db.commit()
        
        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_created",
            entity_id=str(expense.id),
            payload={"description": expense.description, "amount": float(expense.amount)}
        )

        return self._expense_row(expense, actor_email)
