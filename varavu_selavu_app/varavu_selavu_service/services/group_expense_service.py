import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, ExpenseItem, ExpenseItemSplit, Group, GroupMember
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.split_engine import SplitError, resolve_split, validate_payers
from varavu_selavu_service.services.item_split_engine import resolve_itemized_split


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
        return datetime.strptime(date_str, "%m/%d/%Y").replace(hour=12, tzinfo=timezone.utc)

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

    def _resolve_currency(self, gid: uuid.UUID, currency: Optional[str]):
        """TS-GRP-131: resolves the expense's own currency + (if it differs
        from the group's) the FX rate to convert it into the group's home
        currency, snapshotted once at creation/edit time."""
        group = self.db.query(Group).filter(Group.id == gid).first()
        group_currency = (group.currency if group else "USD").upper()
        expense_currency = (currency or group_currency).upper()
        if expense_currency == group_currency:
            return expense_currency, None
        from varavu_selavu_service.services.fx_rate_service import FxRateService
        rate = FxRateService(self.db).get_rate(expense_currency, group_currency)
        return expense_currency, rate

    def _expense_row(self, expense: Expense, actor_email: str) -> Dict:
        caller_member = self.group_service.get_member_by_email(expense.group_id, actor_email)
        split_rows = self.db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).all()
        my_share = 0.0
        if caller_member is not None:
            mine = next((s for s in split_rows if s.member_id == caller_member.id), None)
            if mine is not None:
                my_share = float(mine.amount_owed)
        splits = [{"member_id": str(s.member_id), "share": float(s.amount_owed)} for s in split_rows]

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
            "splits": splits,
            "currency": expense.currency,
            "fx_rate_to_group_currency": float(expense.fx_rate_to_group_currency) if expense.fx_rate_to_group_currency is not None else None,
            "split_type": expense.split_type,
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
        currency: Optional[str] = None,
    ) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)

        split_results = self._validate_and_resolve(gid, amount, payers, split_type, split_entries)
        expense_currency, fx_rate = self._resolve_currency(gid, currency)

        expense = Expense(
            id=uuid.uuid4(),
            user_email=actor_email,
            group_id=gid,
            split_type=split_type,
            purchased_at=self._parse_date(date),
            category_id=category,
            amount=amount,
            currency=expense_currency,
            fx_rate_to_group_currency=fx_rate,
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
        currency: Optional[str] = None,
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
        expense_currency, fx_rate = self._resolve_currency(gid, currency)

        # Snapshot pre-edit values so the activity log (and TS-GRP-127's edit
        # history view built on top of it) can show a real old -> new diff.
        old_snapshot = {
            "description": expense.description,
            "category": expense.category_id,
            "amount": float(expense.amount) if expense.amount is not None else None,
            "merchant_name": expense.merchant_name,
        }

        expense.purchased_at = self._parse_date(date)
        expense.description = description
        expense.category_id = category
        expense.amount = amount
        expense.currency = expense_currency
        expense.fx_rate_to_group_currency = fx_rate
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
        
        new_snapshot = {
            "description": expense.description,
            "category": expense.category_id,
            "amount": float(expense.amount) if expense.amount is not None else None,
            "merchant_name": expense.merchant_name,
        }
        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_updated",
            entity_id=str(expense.id),
            payload={"old": old_snapshot, "new": new_snapshot}
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

    def convert_personal_expense(
        self,
        expense_id: str,
        group_id: str,
        actor_email: str,
        split_type: str,
        split_entries: List[dict],
    ) -> Dict:
        """TS-GRP-121: converts an existing personal expense into a group
        expense in place — same expense.id, gains group_id/split_type plus
        new expense_payers/expense_splits rows. The converter is sole payer
        by default (E11); only the expense's own owner may convert it."""
        eid = _to_uuid(expense_id)
        expense = self.db.query(Expense).filter(Expense.id == eid).first() if eid else None
        if expense is None:
            raise HTTPException(status_code=404, detail="Expense not found")
        if expense.group_id is not None:
            raise HTTPException(status_code=400, detail="Expense is already a group expense")
        if expense.user_email != actor_email:
            raise HTTPException(status_code=403, detail="Only the expense's owner may convert it")

        # Membership check happens after ownership/already-converted checks so
        # those return their own specific status codes first.
        converter_member = self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)

        amount = float(expense.amount)
        payers = [{"member_id": str(converter_member.id), "amount_paid": amount}]
        split_results = self._validate_and_resolve(gid, amount, payers, split_type, split_entries)
        expense_currency, fx_rate = self._resolve_currency(gid, expense.currency)

        expense.group_id = gid
        expense.split_type = split_type
        expense.currency = expense_currency
        expense.fx_rate_to_group_currency = fx_rate
        self.db.flush()

        self.db.add(
            ExpensePayer(
                id=uuid.uuid4(),
                expense_id=expense.id,
                member_id=converter_member.id,
                amount_paid=amount,
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
            action="expense_converted",
            entity_id=str(expense.id),
            payload={"description": expense.description, "amount": amount},
        )

        return self._expense_row(expense, actor_email)

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
        fingerprint: Optional[str] = None,
        currency: Optional[str] = None,
    ) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        expense_currency, fx_rate = self._resolve_currency(gid, currency)

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
            currency=expense_currency,
            fx_rate_to_group_currency=fx_rate,
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
            
        self._write_items(expense.id, actor_email, items)

        self.db.commit()

        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_created",
            entity_id=str(expense.id),
            payload={"description": expense.description, "amount": float(expense.amount)}
        )

        return self._expense_row(expense, actor_email)

    def _write_items(self, expense_id: uuid.UUID, actor_email: str, items: List[dict]) -> None:
        """Inserts ExpenseItem + (for any item carrying member_ratios) ExpenseItemSplit rows.
        Shared by create_itemized_expense and update_items — does not commit or log activity,
        callers own the transaction boundary."""
        for item in items:
            expense_item = ExpenseItem(
                id=uuid.uuid4(),
                expense_id=expense_id,
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

            for mid, ratio in item.get("member_ratios", {}).items():
                ratio_val = float(ratio)
                if ratio_val <= 0:
                    continue
                item_split = ExpenseItemSplit(
                    id=uuid.uuid4(),
                    expense_item_id=expense_item.id,
                    member_id=_to_uuid(mid),
                    ratio=ratio_val,
                    amount=item["line_total"] * ratio_val,
                )
                self.db.add(item_split)

    # ------------------------------------------------------------------
    # Post-save item viewing/editing
    # ------------------------------------------------------------------

    def get_items(self, group_id: str, expense_id: str, actor_email: str) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        eid = _to_uuid(expense_id)
        expense = (
            self.db.query(Expense).filter(Expense.id == eid, Expense.group_id == gid).first() if eid else None
        )
        if expense is None:
            raise HTTPException(status_code=404, detail="Group expense not found")

        rows = (
            self.db.query(ExpenseItem)
            .filter(ExpenseItem.expense_id == expense.id)
            .order_by(ExpenseItem.line_no)
            .all()
        )
        items = [
            {
                "id": str(r.id),
                "line_no": r.line_no,
                "item_name": r.item_name,
                "normalized_name": r.normalized_name,
                "category_id": r.category_id,
                "quantity": float(r.quantity) if r.quantity is not None else None,
                "unit": r.unit,
                "unit_price": float(r.unit_price) if r.unit_price is not None else None,
                "line_total": float(r.line_total) if r.line_total is not None else 0.0,
                "tax": float(r.tax) if r.tax is not None else 0.0,
                "discount": float(r.discount) if r.discount is not None else 0.0,
            }
            for r in rows
        ]
        return {
            "items": items,
            "amount": float(expense.amount or 0),
            "tax": sum(i["tax"] for i in items),
            "discount": sum(i["discount"] for i in items),
        }

    @staticmethod
    def _rescale_payers(existing_payers: List[ExpensePayer], old_amount: float, new_amount: float) -> List[Dict]:
        """Keeps each payer's proportional share of the total when items edits change the
        expense's amount, instead of forcing the user back into the payer picker. Falls back
        to an equal split if the old amount was 0 (shouldn't normally happen for a saved
        itemized expense). Rounds to cents with the remainder absorbed by the largest payer."""
        if not existing_payers:
            return []
        total_cents = round(new_amount * 100)
        if old_amount and old_amount > 0:
            raw = [(p, (float(p.amount_paid) / old_amount) * new_amount) for p in existing_payers]
        else:
            share = new_amount / len(existing_payers)
            raw = [(p, share) for p in existing_payers]

        rounded = [(p, int(round(amt * 100))) for p, amt in raw]
        residual = total_cents - sum(c for _, c in rounded)
        if rounded:
            idx = max(range(len(rounded)), key=lambda i: rounded[i][1])
            p, c = rounded[idx]
            rounded[idx] = (p, c + residual)

        return [{"member_id": str(p.member_id), "amount_paid": c / 100} for p, c in rounded]

    def update_items(
        self,
        group_id: str,
        expense_id: str,
        actor_email: str,
        items: List[dict],
        amount: float,
        tax: float = 0,
        discount: float = 0,
    ) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        eid = _to_uuid(expense_id)
        expense = (
            self.db.query(Expense).filter(Expense.id == eid, Expense.group_id == gid).first() if eid else None
        )
        if expense is None:
            raise HTTPException(status_code=404, detail="Group expense not found")

        if not items:
            raise HTTPException(status_code=400, detail="At least one item is required")
        for item in items:
            if "item_name" not in item or "line_total" not in item:
                raise HTTPException(status_code=400, detail="Invalid item")
        subtotal = sum(i.get("line_total", 0) for i in items)
        if abs(subtotal + tax - discount - amount) > 0.02:
            raise HTTPException(status_code=400, detail="Totals do not reconcile")

        # Preserve who's currently assigned to items (falling back to the expense's payers,
        # then the actor) and re-split every item equally across that same set — matches the
        # simplification the creation flow already uses (no per-item person-assignment UI here).
        participant_ids = {
            str(member_id)
            for (member_id,) in (
                self.db.query(ExpenseItemSplit.member_id)
                .join(ExpenseItem, ExpenseItemSplit.expense_item_id == ExpenseItem.id)
                .filter(ExpenseItem.expense_id == expense.id)
                .distinct()
                .all()
            )
        }
        existing_payers = self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == expense.id).all()
        if not participant_ids:
            participant_ids = {str(p.member_id) for p in existing_payers}
        if not participant_ids:
            actor_member = self.group_service.get_member_by_email(gid, actor_email)
            if actor_member:
                participant_ids = {str(actor_member.id)}

        ratio = 1 / len(participant_ids) if participant_ids else 0
        items_with_ratios = [
            {**item, "member_ratios": {mid: ratio for mid in participant_ids}} for item in items
        ]

        try:
            split_results = resolve_itemized_split(items_with_ratios, tax=tax, tip=0, discount=discount, total_amount=amount)
        except SplitError as e:
            raise HTTPException(status_code=400, detail={"message": str(e), **e.details})

        new_payers = self._rescale_payers(existing_payers, float(expense.amount or 0), amount)

        item_ids_subq = self.db.query(ExpenseItem.id).filter(ExpenseItem.expense_id == expense.id)
        self.db.query(ExpenseItemSplit).filter(ExpenseItemSplit.expense_item_id.in_(item_ids_subq)).delete(synchronize_session=False)
        self.db.query(ExpenseItem).filter(ExpenseItem.expense_id == expense.id).delete(synchronize_session=False)
        self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == expense.id).delete(synchronize_session=False)
        self.db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).delete(synchronize_session=False)

        expense.amount = amount

        for p in new_payers:
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
        self._write_items(expense.id, actor_email, items_with_ratios)

        self.db.commit()

        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_updated",
            entity_id=str(expense.id),
            payload={"description": expense.description, "amount": float(expense.amount)}
        )

        return self.get_items(group_id, expense_id, actor_email)
