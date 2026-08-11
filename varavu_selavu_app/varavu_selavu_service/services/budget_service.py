from __future__ import annotations

import statistics
import uuid
from calendar import monthrange
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import Budget, BudgetPeriodSnapshot
from varavu_selavu_service.services.analysis_service import AnalysisService
from varavu_selavu_service.services.recurring_service import RecurringService

DEFAULT_ALERT_THRESHOLDS = [80, 100]
PACE_AT_RISK_RATIO = 1.10  # projected 100-110% of amount -> at_risk; > 110% -> over_pace


def _period_bounds(period_str: Optional[str], today: Optional[date] = None) -> Tuple[date, date]:
    """v1 is monthly-only (PRD §5.1) — `period_str` is 'YYYY-MM', defaulting to the current
    month. Period is defined in calendar terms; per-user timezone handling (PRD §9) is left to
    the client, which already sends/reads dates as plain YYYY-MM-DD."""
    today = today or date.today()
    if period_str:
        try:
            year, month = (int(p) for p in period_str.split("-", 1))
        except (ValueError, TypeError):
            raise HTTPException(status_code=422, detail="period must be in YYYY-MM format")
    else:
        year, month = today.year, today.month
    if not (1 <= month <= 12):
        raise HTTPException(status_code=422, detail="period must be in YYYY-MM format")
    last_day = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _round(value) -> float:
    return round(float(value or 0), 2)


class BudgetService:
    def __init__(self, db: Session):
        self.db = db
        self.analysis_service = AnalysisService(db)
        self.recurring_service = RecurringService(db)

    # ------------------------------------------------------------------
    # Lookup helpers
    # ------------------------------------------------------------------

    def _get_owned(self, user_id: str, budget_id: str) -> Budget:
        try:
            bid = uuid.UUID(str(budget_id))
        except (ValueError, TypeError):
            raise HTTPException(status_code=404, detail="Budget not found")
        row = (
            self.db.query(Budget)
            .filter(Budget.id == bid, Budget.user_email == user_id, Budget.deleted_at.is_(None))
            .first()
        )
        if not row:
            raise HTTPException(status_code=404, detail="Budget not found")
        return row

    def _find_existing(self, user_id: str, scope: str, target_type: str, category: Optional[str]) -> Optional[Budget]:
        # FR-2 dedupe — a plain unique constraint can't portably dedupe a nullable `category`
        # column (NULL <> NULL in both Postgres and sqlite), so this is enforced here, matching
        # RecurringService.upsert_template's find-existing-or-create precedent.
        query = self.db.query(Budget).filter(
            Budget.user_email == user_id,
            Budget.scope == scope,
            Budget.target_type == target_type,
            Budget.period_type == "monthly",
            Budget.deleted_at.is_(None),
        )
        if category is None:
            query = query.filter(Budget.category.is_(None))
        else:
            query = query.filter(Budget.category == category)
        return query.first()

    # ------------------------------------------------------------------
    # Live compute — spent/committed/remaining/projected/status
    # ------------------------------------------------------------------

    def _spent_for(self, user_id: str, scope: str, target_type: str, category: Optional[str], period_start: date) -> float:
        # Reuses AnalysisService.analyze() — the same balance/scope function GET /analysis uses —
        # rather than a third calculation path (spec §8 consistency requirement). use_cache=False
        # so a budget reflects an expense saved a moment ago (FR-5), not a stale 60s cache entry.
        result = self.analysis_service.analyze(
            user_id=user_id, year=period_start.year, month=period_start.month, scope=scope, use_cache=False
        )
        if target_type == "overall":
            return _round(result.get("total_expenses", 0))
        for row in result.get("category_totals", []):
            if row.get("category") == category:
                return _round(row.get("total", 0))
        return 0.0

    def _committed_for(self, user_id: str, target_type: str, category: Optional[str], period_start: date, period_end: date) -> float:
        # FR-4: known recurring charges not yet posted as an expense, due within the rest of this
        # period. Personal (non-group) templates only — a group's recurring commitment is a
        # per-member split the recurring engine doesn't resolve ahead of time, so it's left out of
        # `committed` rather than approximated (documented simplification, not silently wrong).
        occurrences = self.recurring_service.compute_due(user_id, as_of_iso=period_end.isoformat())
        start_iso, end_iso = period_start.isoformat(), period_end.isoformat()
        total = 0.0
        for occ in occurrences:
            if occ.get("group_id"):
                continue
            if not (start_iso <= occ["date_iso"] <= end_iso):
                continue
            if target_type == "category" and occ.get("category") != category:
                continue
            total += float(occ.get("suggested_cost") or 0)
        return _round(total)

    def _status_for(self, spent: float, projected: float, amount: float) -> str:
        if amount <= 0:
            return "exceeded" if spent > 0 else "on_track"
        if spent > amount:
            return "exceeded"
        ratio = projected / amount
        if ratio <= 1.0:
            return "on_track"
        if ratio <= PACE_AT_RISK_RATIO:
            return "at_risk"
        return "over_pace"

    def _live_figures(self, budget: Budget, period_start: date, period_end: date, today: date) -> Dict[str, Any]:
        spent = self._spent_for(budget.user_email, budget.scope, budget.target_type, budget.category, period_start)
        committed = self._committed_for(budget.user_email, budget.target_type, budget.category, period_start, period_end)
        amount = float(budget.amount)
        remaining = _round(amount - spent - committed)

        # Straight-line pace (PRD §12 Q1 — simpler and explainable over weekday-weighting).
        # Elapsed is clamped into (0, total_days] whether `today` is mid-period or the query is
        # for the just-started current month, so day-1 doesn't divide by (near) zero.
        total_days = (period_end - period_start).days + 1
        elapsed_days = max(1, min(total_days, (today - period_start).days + 1))
        fraction_elapsed = elapsed_days / total_days
        projected = _round(spent / fraction_elapsed) if fraction_elapsed > 0 else spent

        status = self._status_for(spent, projected, amount)
        return {
            "spent": spent,
            "committed": committed,
            "remaining": remaining,
            "projected": projected,
            "status": status,
        }

    def _get_or_create_snapshot(self, budget: Budget, period_start: date, period_end: date) -> Dict[str, Any]:
        # FR-7/FR-8: once a period has closed, its figures are frozen the first time they're
        # read — no scheduler needed, and every subsequent read (including after the budget is
        # edited or soft-deleted) returns the same immutable snapshot.
        snap = (
            self.db.query(BudgetPeriodSnapshot)
            .filter(BudgetPeriodSnapshot.budget_id == budget.id, BudgetPeriodSnapshot.period_start == period_start)
            .first()
        )
        if snap is None:
            spent = self._spent_for(budget.user_email, budget.scope, budget.target_type, budget.category, period_start)
            amount = float(budget.amount)
            status = "exceeded" if spent > amount else "on_track"
            snap = BudgetPeriodSnapshot(
                id=uuid.uuid4(),
                budget_id=budget.id,
                period_start=period_start,
                period_end=period_end,
                amount=amount,
                spent=spent,
                status=status,
            )
            self.db.add(snap)
            self.db.commit()
        return {
            "spent": _round(snap.spent),
            "committed": 0.0,
            "remaining": _round(float(snap.amount) - float(snap.spent)),
            "projected": _round(snap.spent),
            "status": snap.status,
        }

    def _to_dto(self, budget: Budget, period_start: date, period_end: date, today: Optional[date] = None) -> Dict[str, Any]:
        today = today or date.today()
        is_past = period_end < today
        figures = self._get_or_create_snapshot(budget, period_start, period_end) if is_past else self._live_figures(budget, period_start, period_end, today)
        return {
            "id": str(budget.id),
            "scope": budget.scope,
            "target_type": budget.target_type,
            "category": budget.category,
            "amount": _round(budget.amount),
            "currency": budget.currency,
            "period_type": budget.period_type,
            "rollover": budget.rollover,
            "alert_thresholds": budget.alert_thresholds or list(DEFAULT_ALERT_THRESHOLDS),
            "muted": budget.muted,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "is_snapshot": is_past,
            **figures,
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_budgets(self, user_id: str, scope: Optional[str] = None, period_str: Optional[str] = None) -> List[Dict[str, Any]]:
        period_start, period_end = _period_bounds(period_str)
        query = self.db.query(Budget).filter(Budget.user_email == user_id, Budget.deleted_at.is_(None))
        if scope:
            query = query.filter(Budget.scope == scope)
        rows = query.order_by(Budget.created_at.asc()).all()
        return [self._to_dto(b, period_start, period_end) for b in rows]

    def create_or_update(self, user_id: str, req) -> Dict[str, Any]:
        category = req.category if req.target_type == "category" else None
        if req.target_type == "category" and not category:
            raise HTTPException(status_code=422, detail="category is required for a category budget")

        existing = self._find_existing(user_id, req.scope, req.target_type, category)
        if existing:
            existing.amount = req.amount
            existing.currency = req.currency
            existing.rollover = req.rollover
            existing.alert_thresholds = req.alert_thresholds or list(DEFAULT_ALERT_THRESHOLDS)
            existing.deleted_at = None  # re-creating a soft-deleted budget resurrects it
            budget = existing
        else:
            budget = Budget(
                id=uuid.uuid4(),
                user_email=user_id,
                scope=req.scope,
                target_type=req.target_type,
                category=category,
                amount=req.amount,
                currency=req.currency,
                period_type="monthly",
                rollover=req.rollover,
                alert_thresholds=req.alert_thresholds or list(DEFAULT_ALERT_THRESHOLDS),
                muted=False,
                start_date=date.today(),
            )
            self.db.add(budget)
        self.db.commit()
        self.db.refresh(budget)

        period_start, period_end = _period_bounds(None)
        return self._to_dto(budget, period_start, period_end)

    def update_budget(self, user_id: str, budget_id: str, patch) -> Dict[str, Any]:
        budget = self._get_owned(user_id, budget_id)
        if patch.amount is not None:
            budget.amount = patch.amount
        if patch.rollover is not None:
            budget.rollover = patch.rollover
        if patch.alert_thresholds is not None:
            budget.alert_thresholds = patch.alert_thresholds
        if patch.muted is not None:
            budget.muted = patch.muted
        self.db.commit()
        self.db.refresh(budget)

        # FR-7: editing mid-period recomputes status immediately — trivially true since status
        # is always computed live for the current (non-closed) period.
        period_start, period_end = _period_bounds(None)
        return self._to_dto(budget, period_start, period_end)

    def delete_budget(self, user_id: str, budget_id: str) -> None:
        budget = self._get_owned(user_id, budget_id)
        # Soft delete only — the row (and its FK'd snapshots) stays physically present, which is
        # what makes FR-8's "retains past-period snapshots" true for free rather than requiring a
        # separate archival copy.
        budget.deleted_at = datetime.utcnow()
        self.db.commit()

    def get_breakdown(self, user_id: str, budget_id: str, period_str: Optional[str] = None) -> Dict[str, Any]:
        budget = self._get_owned(user_id, budget_id)
        period_start, period_end = _period_bounds(period_str)
        dto = self._to_dto(budget, period_start, period_end)

        result = self.analysis_service.analyze(
            user_id=user_id, year=period_start.year, month=period_start.month, scope=budget.scope, use_cache=False
        )
        details = result.get("category_expense_details", {})
        if budget.target_type == "overall":
            rows = [row for cat_rows in details.values() for row in cat_rows]
        else:
            rows = list(details.get(budget.category, []))
        rows.sort(key=lambda r: r.get("date") or "", reverse=True)

        return {
            "budget": dto,
            "transactions": [
                {
                    "date": r.get("date", ""),
                    "description": r.get("description", ""),
                    "category": r.get("category", ""),
                    "cost": _round(r.get("cost", 0)),
                }
                for r in rows
            ],
        }

    def get_suggestions(self, user_id: str, scope: str = "personal") -> List[Dict[str, Any]]:
        # §5.4 — median of the last 3 completed calendar months per category. "Completed" so an
        # in-progress current month (partial data) never skews the suggestion low.
        today = date.today()
        samples: Dict[str, List[float]] = {}
        y, m = today.year, today.month
        for _ in range(3):
            m -= 1
            if m == 0:
                m = 12
                y -= 1
            result = self.analysis_service.analyze(user_id=user_id, year=y, month=m, scope=scope, use_cache=False)
            for row in result.get("category_totals", []):
                samples.setdefault(row["category"], []).append(float(row["total"]))

        suggestions = [
            {
                "category": category,
                "suggested_amount": _round(statistics.median(values)),
                "based_on_months": len(values),
            }
            for category, values in samples.items()
        ]
        suggestions.sort(key=lambda s: s["suggested_amount"], reverse=True)
        return suggestions
