import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from varavu_selavu_service.core.expense_dates import assert_expense_date
from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, ExpenseItem, ExpenseItemSplit, Group, GroupMember
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.split_engine import SplitError, SplitResult, resolve_split, validate_payers
from varavu_selavu_service.services import receipt_lines
from varavu_selavu_service.services.tag_service import get_tags_for_expenses
from varavu_selavu_service.services.card_service import get_card_refs_for_expenses
from varavu_selavu_service.services.expense_service import NOTES_UNCHANGED


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _absorb_rounding(cents: List[int], total_cents: int) -> None:
    """Makes `cents` add up to `total_cents` after proportional rounding, largest value first. A shortfall
    to remove is taken one cent at a time: taking it all from one value could push that value below zero
    (four payers of 1.00 rescaled to 0.02 stored -0.01)."""
    difference = total_cents - sum(cents)
    if difference > 0:
        cents[max(range(len(cents)), key=lambda i: cents[i])] += difference
    for _ in range(-difference):
        cents[max(range(len(cents)), key=lambda i: cents[i])] -= 1


def lock_expense(db, expense_id) -> Optional[Expense]:
    """Held until commit, and re-read once granted. Take it before reading shares in anything that rewrites
    or pays them: an edit replaces the share rows, so locking those rows can't hold off a second request."""
    return db.query(Expense).filter(Expense.id == expense_id).with_for_update().populate_existing().first()


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

    def _expense_row(self, expense: Expense, actor_email: str, has_items: Optional[bool] = None) -> Dict:
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

        # TS-TAG-103: filtered to actor_email (PRD §9.2, load-bearing) — a tag applied to a
        # shared group expense must never be visible to any member other than whoever applied it.
        tags = get_tags_for_expenses(self.db, [expense.id], actor_email).get(str(expense.id), [])
        card = get_card_refs_for_expenses(self.db, [expense.card_id]).get(str(expense.card_id)) if expense.card_id else None

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
            "has_items": self._is_receipt(expense) if has_items is None else has_items,
            "tags": tags,
            "card": card,
            "notes": expense.notes,
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
        card_id: Optional[str] = None,
        notes: Optional[str] = None,
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
            card_id=uuid.UUID(str(card_id)) if card_id else None,
            notes=notes,
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
        # One query for the page: line count and how many lines have an original price, per expense.
        line_stats = {
            eid: (n, priced) for eid, n, priced in self.db.query(
                ExpenseItem.expense_id, func.count(ExpenseItem.id), func.count(ExpenseItem.original_price)
            ).filter(ExpenseItem.expense_id.in_([e.id for e in sliced])).group_by(ExpenseItem.expense_id)
        } if sliced else {}

        assigned = {
            eid for (eid,) in self.db.query(ExpenseItem.expense_id)
            .join(ExpenseItemSplit, ExpenseItemSplit.expense_item_id == ExpenseItem.id)
            .filter(ExpenseItem.expense_id.in_([e.id for e in sliced])).distinct()
        } if sliced else set()

        def receipt(e: Expense) -> bool:
            n, priced = line_stats.get(e.id, (0, 0))
            return e.split_type == "itemized" or n > 1 or priced > 0 or e.id in assigned

        items = [self._expense_row(e, actor_email, has_items=receipt(e)) for e in sliced]
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
        payers: Optional[List[dict]],
        split_type: Optional[str],
        split_entries: Optional[List[dict]],
        currency: Optional[str] = None,
        card_id: Optional[str] = None,
        notes=NOTES_UNCHANGED,
    ) -> Dict:
        """`payers`/`split_type`/`split_entries` all None keeps the stored payers and split,
        rescaled to the new amount (see `_carry_over_split`)."""
        # Any group member may edit any group expense (spec §5.2, decision §17.2).
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        eid = _to_uuid(expense_id)
        expense = (
            self.db.query(Expense).filter(Expense.id == eid, Expense.group_id == gid).first() if eid else None
        )
        if expense is None:
            raise HTTPException(status_code=404, detail="Group expense not found")
        # The exchange-rate lookup can commit, which would drop the lock, so it comes first.
        expense_currency, fx_rate = self._resolve_currency(gid, currency)
        if lock_expense(self.db, eid) is None:
            raise HTTPException(status_code=404, detail="Group expense not found")

        if self._is_receipt(expense):
            # TS-FIX-102: a receipt is split on its total (Equal/Exact/Shares). Its amount changes only
            # through the items edit, which checks the totals; any other edit (text, date, split) keeps
            # the stored amount exactly, so an older receipt whose figures don't add up stays editable.
            if payers is not None:
                self._require_receipt_split_type(split_type)
            if receipt_lines.money(amount) != receipt_lines.money(expense.amount):
                raise receipt_lines.http_error(
                    "totals_mismatch",
                    "This receipt's amount must match its items. Edit the items to change the amount.",
                )
        if payers is None:
            payers, split_type, split_results = self._carry_over_split(expense, amount)
        else:
            split_results = self._validate_and_resolve(gid, amount, payers, split_type, split_entries)

        # Snapshot pre-edit values so the activity log (and TS-GRP-127's edit
        # history view built on top of it) can show a real old -> new diff.
        old_snapshot = {
            "description": expense.description,
            "category": expense.category_id,
            "amount": float(expense.amount) if expense.amount is not None else None,
            "merchant_name": expense.merchant_name,
        }

        new_purchased_at = self._parse_date(date)
        # Editing an older expense is fine as long as its date is left alone.
        assert_expense_date(date, check_past=not (expense.purchased_at and expense.purchased_at.date() == new_purchased_at.date()))
        expense.purchased_at = new_purchased_at
        expense.description = description
        expense.category_id = category
        expense.amount = amount
        expense.currency = expense_currency
        expense.fx_rate_to_group_currency = fx_rate
        expense.merchant_name = merchant_name
        expense.split_type = split_type
        expense.card_id = uuid.UUID(str(card_id)) if card_id else None
        if notes is not NOTES_UNCHANGED:
            expense.notes = notes

        # Atomic rewrite: replace payers/splits (E2 — allowed even after a settlement;
        # no settlement is auto-modified).
        # A paid share stays paid, or "Settle my share" would record it again; a changed amount
        # shows in the balances.
        paid_shares = self._paid_shares(expense.id)
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
                    settled_via_settlement_id=paid_shares.get(_to_uuid(r.member_id)),
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
        from varavu_selavu_service.services.personal_write_lock import lock_personal_user
        lock_personal_user(self.db, actor_email)
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

        if self._is_receipt(expense):
            # TS-FIX-102: a receipt moved into a group is split on its total too.
            self._require_receipt_split_type(split_type)
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

    def _is_receipt(self, expense: Expense) -> bool:
        """TS-FIX-102 receipt rules apply only to real receipts, not to a moved personal expense that
        carries its synthesized proxy line (see receipt_lines.is_receipt)."""
        rows = self.db.query(ExpenseItem.id, ExpenseItem.original_price).filter(ExpenseItem.expense_id == expense.id).all()
        if receipt_lines.is_receipt(expense.split_type, rows):
            return True
        # An old item-split receipt stays a receipt after it is re-split (its assignment rows remain).
        return bool(rows) and self.db.query(ExpenseItemSplit.id).filter(
            ExpenseItemSplit.expense_item_id.in_([r.id for r in rows])
        ).first() is not None

    @staticmethod
    def _require_receipt_split_type(split_type: Optional[str]) -> None:
        if split_type not in receipt_lines.RECEIPT_SPLIT_TYPES:
            raise HTTPException(
                status_code=400,
                detail={"code": "receipt_split_type",
                        "message": "A receipt is split on its total: Equal, Exact or Shares."},
            )

    def create_itemized_expense(
        self,
        group_id: str,
        actor_email: str,
        date: str,
        description: str,
        category: str,
        amount,
        merchant_name: Optional[str],
        payers: List[dict],
        items: List[dict],
        split_type: str,
        split_entries: List[dict],
        tax=0,
        tip=0,
        fingerprint: Optional[str] = None,
        currency: Optional[str] = None,
        card_id: Optional[str] = None,
    ) -> Dict:
        """A group receipt (TS-FIX-102): the lines are for tracking only; shares come from splitting the
        TOTAL by Equal, Exact or Shares, so they equal the amount to the cent."""
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        self._require_receipt_split_type(split_type)
        lines = receipt_lines.checked_lines(items, amount=amount, tax=tax, tip=tip)
        expense_currency, fx_rate = self._resolve_currency(gid, currency)
        split_results = self._validate_and_resolve(gid, amount, payers, split_type, split_entries)

        expense = Expense(
            id=uuid.uuid4(),
            user_email=actor_email,
            group_id=gid,
            split_type=split_type,
            purchased_at=self._parse_date(date),
            category_id=category,
            amount=amount,
            tax=receipt_lines.money(tax),
            tip=receipt_lines.money(tip),
            discount=receipt_lines.savings_of(lines),
            currency=expense_currency,
            fx_rate_to_group_currency=fx_rate,
            merchant_name=merchant_name,
            description=description,
            fingerprint=fingerprint,
            card_id=uuid.UUID(str(card_id)) if card_id else None,
        )
        self.db.add(expense)
        self.db.flush()
        self._write_payers_and_splits(expense.id, payers, split_results)
        self._write_items(expense.id, actor_email, lines)
        self.db.commit()

        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_created",
            entity_id=str(expense.id),
            payload={"description": expense.description, "amount": float(expense.amount)}
        )

        return self._expense_row(expense, actor_email)

    def _paid_shares(self, expense_id) -> Dict:
        """Member id to the settlement that paid their share; read it before replacing the rows."""
        return dict(
            self.db.query(ExpenseSplit.member_id, ExpenseSplit.settled_via_settlement_id)
            .filter(ExpenseSplit.expense_id == expense_id)
            .all()
        )

    def _write_payers_and_splits(self, expense_id, payers: List[dict], split_results, paid_shares: Optional[Dict] = None) -> None:
        for p in payers:
            self.db.add(ExpensePayer(id=uuid.uuid4(), expense_id=expense_id,
                                     member_id=_to_uuid(p["member_id"]), amount_paid=p["amount_paid"]))
        for r in split_results:
            self.db.add(ExpenseSplit(id=uuid.uuid4(), expense_id=expense_id, member_id=_to_uuid(r.member_id),
                                     amount_owed=r.amount_owed, basis_type=r.basis_type, basis_value=r.basis_value,
                                     settled_via_settlement_id=(paid_shares or {}).get(_to_uuid(r.member_id))))

    @staticmethod
    def _item_fields(item: dict) -> dict:
        return dict(
            line_no=item["line_no"],
            item_name=item["item_name"],
            # Same fallback as PostgresRepo.append_items: item analytics key on this.
            normalized_name=(item.get("normalized_name") or "").strip() or item["item_name"],
            category_id=item.get("category_id"),
            quantity=item.get("quantity"),
            unit=item.get("unit"),
            unit_price=item.get("unit_price"),
            line_total=item["line_total"],
            tax=Decimal("0"),
            discount=item.get("discount", 0),
            original_price=item["original_price"],
            attributes_json=item.get("attributes_json"),
        )

    def _write_items(self, expense_id: uuid.UUID, actor_email: str, items: List[dict]) -> None:
        """Inserts receipt lines (already checked by receipt_lines.checked_lines). No assignment rows:
        item-by-item splitting was removed in TS-FIX-102. Does not commit."""
        for item in items:
            self.db.add(ExpenseItem(id=uuid.uuid4(), expense_id=expense_id, user_email=actor_email,
                                    **self._item_fields(item)))
        self.db.flush()

    # ------------------------------------------------------------------
    # Post-save item viewing/editing
    # ------------------------------------------------------------------

    def _get_expense(self, group_id: str, expense_id: str, actor_email: str) -> Expense:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        eid = _to_uuid(expense_id)
        expense = (
            self.db.query(Expense).filter(Expense.id == eid, Expense.group_id == gid).first() if eid else None
        )
        if expense is None:
            raise HTTPException(status_code=404, detail="Group expense not found")
        return expense

    def _item_rows(self, expense_id) -> List[ExpenseItem]:
        return (
            self.db.query(ExpenseItem).filter(ExpenseItem.expense_id == expense_id).order_by(ExpenseItem.line_no).all()
        )

    def _items_view(self, expense: Expense) -> Dict:
        rows = self._item_rows(expense.id)
        # Old group-made receipts always wrote item-assignment rows and pooled LINE discounts; a personal
        # receipt moved into a group never did and subtracted only its HEADER discount (TS-FIX-102).
        group_made = (
            self.db.query(ExpenseItemSplit.id)
            .filter(ExpenseItemSplit.expense_item_id.in_([r.id for r in rows]))
            .first() is not None
        ) if rows else False
        return receipt_lines.items_view(
            rows, amount=expense.amount, tax=expense.tax, tip=expense.tip,
            header_discount=expense.discount, group=group_made,
        )

    def get_items(self, group_id: str, expense_id: str, actor_email: str) -> Dict:
        return self._items_view(self._get_expense(group_id, expense_id, actor_email))

    def _carry_over_split(self, expense: Expense, new_amount) -> tuple:
        """Keeps an edited expense's payers and split when the client didn't send new ones.
        Same amount: everything is reused exactly. New amount: payers are rescaled
        proportionally; equal/percentage/shares splits are re-resolved from their stored basis
        (so equal stays cent-exact across the same members), and any other split type is
        rescaled proportionally with the rounding remainder on the largest share."""
        old_amount = Decimal(str(expense.amount or 0))
        new_amount = Decimal(str(new_amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        existing_payers = self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == expense.id).all()
        existing_splits = self.db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).all()
        split_type = expense.split_type or "equal"
        if not existing_payers or not existing_splits:
            raise HTTPException(status_code=400, detail="This expense has no split to keep; send payers and split")

        if new_amount == old_amount:
            payers = [{"member_id": str(p.member_id), "amount_paid": Decimal(str(p.amount_paid))} for p in existing_payers]
            results = [
                SplitResult(member_id=str(s.member_id), amount_owed=Decimal(str(s.amount_owed)),
                            basis_type=s.basis_type, basis_value=s.basis_value)
                for s in existing_splits
            ]
            return payers, split_type, results

        if split_type in ("exact", "itemized") and self._is_receipt(expense):
            # TS-FIX-102 (D8): an Exact or old item-split receipt can't be rescaled meaningfully.
            raise receipt_lines.http_error("split_required", receipt_lines.SPLIT_REQUIRED_MESSAGE)
        payers = self._rescale_payers(existing_payers, old_amount, new_amount)
        if split_type in ("equal", "percentage", "shares") and all(
            split_type == "equal" or s.basis_value is not None for s in existing_splits
        ):
            entries = [{"member_id": str(s.member_id), "value": s.basis_value} for s in existing_splits]
            try:
                return payers, split_type, resolve_split(new_amount, split_type, entries)
            except SplitError as e:
                raise HTTPException(status_code=400, detail={"message": str(e), **e.details})

        total_cents = int(new_amount * 100)
        if old_amount > 0:
            raw = [(s, Decimal(str(s.amount_owed)) / old_amount * new_amount) for s in existing_splits]
        else:
            raw = [(s, new_amount / len(existing_splits)) for s in existing_splits]
        cents = [int((amt * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) for _, amt in raw]
        _absorb_rounding(cents, total_cents)
        results = [
            SplitResult(member_id=str(s.member_id), amount_owed=Decimal(c) / 100,
                        basis_type="exact", basis_value=Decimal(c) / 100)
            for (s, _), c in zip(raw, cents)
        ]
        return payers, (split_type if split_type == "itemized" else "exact"), results

    @staticmethod
    def _rescale_payers(existing_payers: List[ExpensePayer], old_amount: Decimal, new_amount: Decimal) -> List[Dict]:
        """Keeps each payer's proportional share of the total when items edits change the
        expense's amount, instead of forcing the user back into the payer picker. Falls back
        to an equal split if the old amount was 0 (shouldn't normally happen for a saved
        itemized expense). Rounds to cents with the remainder absorbed by the largest payer."""
        if not existing_payers:
            return []
        old_amount = Decimal(str(old_amount))
        new_amount = Decimal(str(new_amount))
        total_cents = int((new_amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if old_amount > 0:
            raw = [(p, (Decimal(str(p.amount_paid)) / old_amount) * new_amount) for p in existing_payers]
        else:
            share = new_amount / len(existing_payers)
            raw = [(p, share) for p in existing_payers]

        cents = [int((amt * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) for _, amt in raw]
        _absorb_rounding(cents, total_cents)

        return [{"member_id": str(p.member_id), "amount_paid": Decimal(c) / 100} for (p, _), c in zip(raw, cents)]

    def update_items(
        self,
        group_id: str,
        expense_id: str,
        actor_email: str,
        items: List[dict],
        amount,
        tax=0,
        tip=0,
        split_type: Optional[str] = None,
        split_entries: Optional[List[dict]] = None,
    ) -> Dict:
        """Edits a group receipt's lines (TS-FIX-102). Paid prices + tax + tip must match the amount.
        Same amount: payers and shares are kept exactly. Changed amount: payers rescale; Equal/Shares
        re-split from their stored basis; Exact and old item-split receipts need `split`. Lines sent with
        an existing id are updated in place, so their old assignment rows stay (D4)."""
        expense = self._get_expense(group_id, expense_id, actor_email)
        if lock_expense(self.db, expense.id) is None:
            raise HTTPException(status_code=404, detail="Group expense not found")
        gid = expense.group_id
        lines = receipt_lines.checked_lines(items, amount=amount, tax=tax, tip=tip)
        new_amount = receipt_lines.money(amount)
        old_amount = receipt_lines.money(expense.amount)

        rewrite = None
        if split_type is not None:
            self._require_receipt_split_type(split_type)
            payers = self._rescale_payers(
                self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == expense.id).all(), old_amount, new_amount
            )
            rewrite = (payers, split_type, self._validate_and_resolve(gid, new_amount, payers, split_type, split_entries or []))
        elif new_amount != old_amount:
            rewrite = self._carry_over_split(expense, new_amount)

        self._replace_lines(expense, actor_email, lines)
        expense.amount = new_amount
        expense.tax = receipt_lines.money(tax)
        expense.tip = receipt_lines.money(tip)
        expense.discount = receipt_lines.savings_of(lines)
        if rewrite is not None:
            payers, new_type, split_results = rewrite
            paid_shares = self._paid_shares(expense.id)
            self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == expense.id).delete(synchronize_session=False)
            self.db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).delete(synchronize_session=False)
            self._write_payers_and_splits(expense.id, payers, split_results, paid_shares)
            expense.split_type = new_type
        self.db.commit()

        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_updated",
            entity_id=str(expense.id),
            payload={"description": expense.description, "amount": float(expense.amount)}
        )
        self.db.refresh(expense)
        return self._items_view(expense)

    def _replace_lines(self, expense: Expense, actor_email: str, lines: List[dict]) -> None:
        existing = {str(r.id): r for r in self._item_rows(expense.id)}
        kept = set()
        for line in lines:
            row = existing.get(str(line.get("id") or ""))
            if row is not None and str(row.id) not in kept:
                kept.add(str(row.id))
                for k, v in self._item_fields(line).items():
                    setattr(row, k, v)
            else:
                self.db.add(ExpenseItem(id=uuid.uuid4(), expense_id=expense.id, user_email=actor_email,
                                        **self._item_fields(line)))
        for rid, row in existing.items():
            if rid not in kept:
                # Its old assignment rows go with it (database cascade); shares live in expense_splits.
                self.db.delete(row)
        self.db.flush()
