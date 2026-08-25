"""TS-TAG-105 — bulk tag apply/remove: either an explicit expense_id list or a date-range +
narrowing filter (PRD §10.3). Preview totals reuse the SAME stored `ExpenseSplit`/`ExpensePayer`
rows `GroupExpenseService._expense_row` already reads to compute "my share" and "what I paid" —
this never re-derives split math itself (PRD §4.1: "tag totals must call the existing
share-computation path rather than reimplementing it").
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, ExpenseTag, GroupMember
from varavu_selavu_service.services.tag_service import TagService


@dataclass
class BulkFilter:
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    group_id: Optional[str] = None
    category: Optional[str] = None
    merchant_name: Optional[str] = None


@dataclass
class BulkResult:
    matched_count: int
    # "Already in the target state before this operation" — already tagged, for apply; already
    # untagged, for remove. Named to match the PRD's shared request/response shape for both ops.
    already_tagged_count: int
    applied_count: int  # 0 when dry_run
    my_expenses_total: float
    i_paid_total: float


class TagBulkService:
    def __init__(self, db: Session):
        self.db = db
        self.tag_service = TagService(db)

    def _member_group_ids(self, user_email: str) -> set:
        return {
            gm.group_id for gm in
            self.db.query(GroupMember).filter(GroupMember.user_email == user_email, GroupMember.status == "active").all()
        }

    def _resolve_candidates(
        self, user_email: str, expense_ids: Optional[List[str]], filter_: Optional[BulkFilter],
    ) -> List[Expense]:
        member_group_ids = self._member_group_ids(user_email)

        if expense_ids is not None:
            try:
                ids = [uuid.UUID(str(e)) for e in expense_ids]
            except ValueError:
                raise HTTPException(status_code=422, detail="expense_ids must be valid UUIDs")
            rows = self.db.query(Expense).filter(Expense.id.in_(ids)).all() if ids else []
        else:
            f = filter_ or BulkFilter()
            conditions = [and_(Expense.user_email == user_email, Expense.group_id.is_(None))]
            if member_group_ids:
                conditions.append(Expense.group_id.in_(member_group_ids))
            q = self.db.query(Expense).filter(or_(*conditions))

            if f.start_date:
                q = q.filter(Expense.purchased_at >= datetime.fromisoformat(f.start_date))
            if f.end_date:
                q = q.filter(Expense.purchased_at <= datetime.fromisoformat(f.end_date + "T23:59:59"))
            if f.group_id:
                q = q.filter(Expense.group_id == uuid.UUID(str(f.group_id)))
            if f.category:
                q = q.filter(Expense.category_id == f.category)
            if f.merchant_name:
                q = q.filter(Expense.merchant_name == f.merchant_name)
            rows = q.all()

        # Access filter — only expenses this user actually has rights to (own personal, or a
        # member of its group). Silently excludes the rest rather than erroring: an explicit
        # expense_ids list may legitimately mix in ids the caller has no business tagging.
        return [
            e for e in rows
            if (e.group_id is None and e.user_email == user_email)
            or (e.group_id is not None and e.group_id in member_group_ids)
        ]

    def _share_totals(self, user_email: str, expenses: List[Expense]) -> Tuple[float, float]:
        personal_total = sum(float(e.amount or 0) for e in expenses if e.group_id is None)
        group_expenses = [e for e in expenses if e.group_id is not None]
        if not group_expenses:
            return round(personal_total, 2), round(personal_total, 2)

        group_ids = {e.group_id for e in group_expenses}
        my_member_ids = {
            gm.id for gm in
            self.db.query(GroupMember).filter(GroupMember.user_email == user_email, GroupMember.group_id.in_(group_ids)).all()
        }
        expense_ids = [e.id for e in group_expenses]

        my_share_total = 0.0
        my_paid_total = 0.0
        if my_member_ids:
            my_share_total = sum(
                float(row.amount_owed) for row in
                self.db.query(ExpenseSplit)
                .filter(ExpenseSplit.expense_id.in_(expense_ids), ExpenseSplit.member_id.in_(my_member_ids))
                .all()
            )
            my_paid_total = sum(
                float(row.amount_paid) for row in
                self.db.query(ExpensePayer)
                .filter(ExpensePayer.expense_id.in_(expense_ids), ExpensePayer.member_id.in_(my_member_ids))
                .all()
            )

        return round(personal_total + my_share_total, 2), round(personal_total + my_paid_total, 2)

    def bulk_apply(self, user_email, tag_id=None, tag_name=None, expense_ids=None, filter_=None, dry_run=True) -> BulkResult:
        return self._bulk(user_email, tag_id, tag_name, expense_ids, filter_, dry_run, remove=False)

    def bulk_remove(self, user_email, tag_id=None, tag_name=None, expense_ids=None, filter_=None, dry_run=True) -> BulkResult:
        return self._bulk(user_email, tag_id, tag_name, expense_ids, filter_, dry_run, remove=True)

    def _bulk(self, user_email, tag_id, tag_name, expense_ids, filter_, dry_run, remove) -> BulkResult:
        if (tag_id is None) == (tag_name is None):
            raise HTTPException(status_code=422, detail="Provide exactly one of tag_id or tag_name")
        if (expense_ids is None) == (filter_ is None):
            raise HTTPException(status_code=422, detail="Provide exactly one of expense_ids or filter")

        candidates = self._resolve_candidates(user_email, expense_ids, filter_)
        matched_count = len(candidates)

        # Resolving the tag AFTER candidates: bulk_remove by tag_name must never auto-create a
        # tag just to discover nothing is tagged with it (create_tag would happily do that,
        # since it's designed for the apply/create-or-resolve path). A nonexistent tag simply
        # means every candidate is already untagged.
        tag = None
        if tag_id is not None:
            tag = self.tag_service._get_owned_tag(user_email, tag_id)
        elif remove:
            from varavu_selavu_service.db.models import Tag
            from varavu_selavu_service.services.tag_utils import normalize_tag_name
            normalized = normalize_tag_name(tag_name)
            tag = self.db.query(Tag).filter(Tag.user_email == user_email, Tag.normalized_name == normalized).first()
            if tag is None:
                my_expenses_total, i_paid_total = self._share_totals(user_email, candidates)
                return BulkResult(
                    matched_count=matched_count, already_tagged_count=matched_count, applied_count=0,
                    my_expenses_total=my_expenses_total, i_paid_total=i_paid_total,
                )
        else:
            tag, _created = self.tag_service.create_tag(user_email, tag_name)

        max_bulk = self.tag_service.settings.TAG_BULK_MAX
        if matched_count > max_bulk:
            raise HTTPException(status_code=422, detail=f"Bulk operation matched {matched_count} expenses, exceeding the {max_bulk} limit")

        candidate_ids = [e.id for e in candidates]
        existing_tagged_ids = set()
        if candidate_ids:
            existing_tagged_ids = {
                row.expense_id for row in
                self.db.query(ExpenseTag.expense_id)
                .filter(ExpenseTag.tag_id == tag.id, ExpenseTag.expense_id.in_(candidate_ids), ExpenseTag.user_email == user_email)
                .all()
            }

        if remove:
            already_in_target_state = matched_count - len(existing_tagged_ids)
            to_change = existing_tagged_ids
        else:
            already_in_target_state = len(existing_tagged_ids)
            untagged = [e for e in candidates if e.id not in existing_tagged_ids]
            # Per-expense TAG_MAX_PER_EXPENSE guard — skip (don't fail the whole batch) any
            # expense already at its own cap from other tags.
            max_per_expense = self.tag_service.settings.TAG_MAX_PER_EXPENSE
            tag_counts = dict(
                self.db.query(ExpenseTag.expense_id, func.count(ExpenseTag.id))
                .filter(ExpenseTag.expense_id.in_([e.id for e in untagged]), ExpenseTag.user_email == user_email)
                .group_by(ExpenseTag.expense_id)
                .all()
            ) if untagged else {}
            to_change = {e.id for e in untagged if tag_counts.get(e.id, 0) < max_per_expense}

        applied_count = 0
        if not dry_run and to_change:
            if remove:
                self.db.query(ExpenseTag).filter(
                    ExpenseTag.tag_id == tag.id, ExpenseTag.expense_id.in_(list(to_change)), ExpenseTag.user_email == user_email,
                ).delete(synchronize_session=False)
            else:
                for eid in to_change:
                    self.db.add(ExpenseTag(id=uuid.uuid4(), tag_id=tag.id, expense_id=eid, user_email=user_email))
            self.db.commit()
            applied_count = len(to_change)

        my_expenses_total, i_paid_total = self._share_totals(user_email, candidates)

        return BulkResult(
            matched_count=matched_count,
            already_tagged_count=already_in_target_state,
            applied_count=applied_count,
            my_expenses_total=my_expenses_total,
            i_paid_total=i_paid_total,
        )
