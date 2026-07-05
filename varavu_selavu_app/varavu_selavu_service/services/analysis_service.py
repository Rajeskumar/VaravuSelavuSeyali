from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
import time
import uuid
from typing import Any, Dict, Optional, Tuple, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, Integer
from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, Group, GroupMember


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


@dataclass
class AnalysisResult:
    data: Dict[str, Any]
    generated_at: float


class AnalysisService:
    """Encapsulates analysis business logic and caching.

    Use analyze() to compute analysis for a user with optional year/month filters.
    The service maintains a simple in-memory cache with a TTL to avoid recomputing
    frequently for the same parameters.
    """

    # Cache key: (user_id, year, month, start_date, end_date, scope, group_id) -> AnalysisResult
    _CACHE: Dict[Tuple[str, Optional[int], Optional[int], Optional[str], Optional[str], str, Optional[str]], AnalysisResult] = {}
    _CACHE_LOCK: RLock = RLock()

    def __init__(self, db: Session, ttl_sec: int = 60):
        self.db = db
        self.ttl_sec = ttl_sec

    def invalidate_cache(self) -> None:
        with self._CACHE_LOCK:
            self._CACHE.clear()

    # --------------------------------------------------------------------------------
    # Shared date-filter / dual-dialect helpers
    # --------------------------------------------------------------------------------

    def _date_filters(self, column, year, month, start_date, end_date, is_sqlite) -> List:
        filters = []
        if start_date:
            filters.append(column >= start_date)
        if end_date:
            filters.append(column <= end_date)
        if year is not None:
            if is_sqlite:
                filters.append(func.cast(func.strftime('%Y', column), Integer) == int(year))
            else:
                filters.append(extract('year', column) == int(year))
        if month is not None:
            if is_sqlite:
                filters.append(func.cast(func.strftime('%m', column), Integer) == int(month))
            else:
                filters.append(extract('month', column) == int(month))
        return filters

    def _month_expr(self, column, is_sqlite):
        if is_sqlite:
            return func.strftime('%Y-%m', column)
        return func.to_char(func.date_trunc('month', column), 'YYYY-MM')

    # --------------------------------------------------------------------------------
    # Personal leg — unchanged behavior for scope=personal, plus a group_id IS NULL
    # guard for personal/combined so group expenses (user_email=creator) aren't
    # double-counted the moment group_id exists (spec §9.1).
    # --------------------------------------------------------------------------------

    def _compute_personal_leg(self, user_id, year, month, start_date, end_date, is_sqlite) -> Dict[str, Any]:
        filters = [Expense.user_email == user_id, Expense.group_id.is_(None)]
        filters += self._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite)

        category_totals: List[Dict[str, Any]] = []
        monthly_trend: List[Dict[str, Any]] = []
        total = 0.0
        category_expense_details: Dict[str, list] = {}

        row_count = self.db.query(func.count(Expense.id)).filter(*filters).scalar() or 0

        if row_count > 0:
            total_val = self.db.query(func.sum(Expense.amount)).filter(*filters).scalar()
            total = float(total_val) if total_val else 0.0

            cat_results = self.db.query(
                Expense.category_id,
                func.sum(Expense.amount).label('cost')
            ).filter(*filters).group_by(Expense.category_id).order_by(func.sum(Expense.amount).desc()).all()

            for r in cat_results:
                cat_name = r[0] or "Uncategorized"
                val = float(r[1])
                category_totals.append({"category": cat_name, "total": val})

            month_expr = self._month_expr(Expense.purchased_at, is_sqlite)
            trend_results = self.db.query(
                month_expr.label('month'),
                func.sum(Expense.amount).label('total')
            ).filter(*filters).group_by(month_expr).order_by(month_expr.asc()).all()

            for r in trend_results:
                if r[0]:
                    monthly_trend.append({"month": r[0], "total": float(r[1])})

            detail_rows = self.db.query(
                Expense.purchased_at,
                Expense.description,
                Expense.category_id,
                Expense.amount
            ).filter(*filters).order_by(Expense.purchased_at.desc()).all()

            for r in detail_rows:
                cat_name = r[2] or "Uncategorized"
                if cat_name not in category_expense_details:
                    category_expense_details[cat_name] = []

                dt_str = ""
                if r[0]:
                    if isinstance(r[0], str):
                        dt_str = r[0][:10]
                    else:
                        dt_str = r[0].strftime("%Y-%m-%d")

                category_expense_details[cat_name].append({
                    "date": dt_str,
                    "description": r[1] or "",
                    "category": cat_name,
                    "cost": float(r[3] or 0),
                })

        return {
            "category_totals": category_totals,
            "monthly_trend": monthly_trend,
            "total": total,
            "category_expense_details": category_expense_details,
            "row_count": row_count,
        }

    # --------------------------------------------------------------------------------
    # "My share" leg — spec §9.1: expense_splits joined to group_members (mine) and
    # expenses (for category/date). Rows are fetched once and aggregated in Python
    # (Phase-1 group data volumes are small, spec §6.5) rather than three separate
    # grouped SQL queries; the WHERE-clause year/month filters still use the same
    # is_sqlite branching as the personal leg, since those are real dialect-specific
    # predicates, not just output formatting.
    # --------------------------------------------------------------------------------

    def _compute_share_leg(self, user_id, year, month, start_date, end_date, is_sqlite, group_id=None) -> Dict[str, Any]:
        query = (
            self.db.query(ExpenseSplit, Expense)
            .join(GroupMember, GroupMember.id == ExpenseSplit.member_id)
            .join(Expense, Expense.id == ExpenseSplit.expense_id)
            .filter(GroupMember.user_email == user_id)
        )
        if group_id:
            gid = _to_uuid(group_id)
            if gid is not None:
                query = query.filter(Expense.group_id == gid)
        query = query.filter(*self._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite))

        category_sums: Dict[str, float] = {}
        month_sums: Dict[str, float] = {}
        details: Dict[str, list] = {}
        total = 0.0
        row_count = 0

        for split, expense in query.all():
            row_count += 1
            amt = float(split.amount_owed or 0)
            cat_name = expense.category_id or "Uncategorized"
            total += amt
            category_sums[cat_name] = category_sums.get(cat_name, 0.0) + amt

            dt_str = ""
            if expense.purchased_at:
                month_key = expense.purchased_at.strftime("%Y-%m")
                month_sums[month_key] = month_sums.get(month_key, 0.0) + amt
                dt_str = expense.purchased_at.strftime("%Y-%m-%d")

            details.setdefault(cat_name, []).append({
                "date": dt_str,
                "description": expense.description or "",
                "category": cat_name,
                "cost": amt,
            })

        category_totals = [
            {"category": k, "total": v} for k, v in sorted(category_sums.items(), key=lambda kv: -kv[1])
        ]
        monthly_trend = [{"month": k, "total": v} for k, v in sorted(month_sums.items())]

        return {
            "category_totals": category_totals,
            "monthly_trend": monthly_trend,
            "total": round(total, 2),
            "category_expense_details": details,
            "row_count": row_count,
        }

    def _merge_legs(self, personal_leg: Dict[str, Any], share_leg: Dict[str, Any]) -> Dict[str, Any]:
        category_sums: Dict[str, float] = {}
        for c in personal_leg["category_totals"] + share_leg["category_totals"]:
            category_sums[c["category"]] = category_sums.get(c["category"], 0.0) + c["total"]
        category_totals = [
            {"category": k, "total": v} for k, v in sorted(category_sums.items(), key=lambda kv: -kv[1])
        ]

        month_sums: Dict[str, float] = {}
        for leg in (personal_leg, share_leg):
            for m in leg["monthly_trend"]:
                month_sums[m["month"]] = month_sums.get(m["month"], 0.0) + m["total"]
        monthly_trend = [{"month": k, "total": v} for k, v in sorted(month_sums.items())]

        details: Dict[str, list] = {}
        for leg in (personal_leg, share_leg):
            for cat, rows in leg["category_expense_details"].items():
                details.setdefault(cat, []).extend(rows)
        for cat in details:
            details[cat].sort(key=lambda r: r["date"], reverse=True)

        return {
            "category_totals": category_totals,
            "monthly_trend": monthly_trend,
            "total": round(personal_leg["total"] + share_leg["total"], 2),
            "category_expense_details": details,
            "row_count": personal_leg["row_count"] + share_leg["row_count"],
        }

    # --------------------------------------------------------------------------------
    # Per-group summaries (combined/groups scope) — reuses BalanceService for my_balance
    # --------------------------------------------------------------------------------

    def _compute_group_summaries(self, user_id, year, month, start_date, end_date, is_sqlite, group_id=None) -> List[Dict[str, Any]]:
        from varavu_selavu_service.services.balance_service import BalanceService  # local import: avoids importing group/balance services on the hot personal-only path

        memberships = (
            self.db.query(GroupMember)
            .join(Group, Group.id == GroupMember.group_id)
            .filter(GroupMember.user_email == user_id, GroupMember.status == "active", Group.status == "active")
            .all()
        )

        if group_id:
            gid = _to_uuid(group_id)
            memberships = [m for m in memberships if gid is not None and m.group_id == gid]

        balance_service = BalanceService(self.db)
        summaries: List[Dict[str, Any]] = []

        for member in memberships:
            group = self.db.query(Group).filter(Group.id == member.group_id).first()
            if group is None:
                continue

            date_filters = self._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite)

            my_share = float(
                self.db.query(func.sum(ExpenseSplit.amount_owed))
                .join(Expense, Expense.id == ExpenseSplit.expense_id)
                .filter(ExpenseSplit.member_id == member.id, Expense.group_id == member.group_id)
                .filter(*date_filters)
                .scalar() or 0
            )
            i_paid = float(
                self.db.query(func.sum(ExpensePayer.amount_paid))
                .join(Expense, Expense.id == ExpensePayer.expense_id)
                .filter(ExpensePayer.member_id == member.id, Expense.group_id == member.group_id)
                .filter(*date_filters)
                .scalar() or 0
            )
            group_total = float(
                self.db.query(func.sum(Expense.amount))
                .filter(Expense.group_id == member.group_id)
                .filter(*date_filters)
                .scalar() or 0
            )
            # my_balance is a running, all-time position (spec §3.1) — not date-scoped.
            my_balance = float(balance_service.member_net(member.group_id, member.id))

            summaries.append({
                "group_id": str(member.group_id),
                "name": group.name,
                "my_share": round(my_share, 2),
                "i_paid": round(i_paid, 2),
                "group_total": round(group_total, 2),
                "my_balance": round(my_balance, 2),
            })

        return summaries

    # --------------------------------------------------------------------------------
    # Public entrypoint
    # --------------------------------------------------------------------------------

    def analyze(
            self,
            user_id: str,
            year: Optional[int] = None,
            month: Optional[int] = None,
            start_date: str | None = None,
            end_date: str | None = None,
            use_cache: bool = True,
            scope: str = "personal",
            group_id: str | None = None,
    ) -> Dict[str, Any]:
        scope = scope or "personal"
        cache_key = (
            user_id,
            int(year) if year is not None else None,
            int(month) if month is not None else None,
            start_date,
            end_date,
            scope,
            group_id,
        )

        now_ts = time.time()

        if use_cache:
            with self._CACHE_LOCK:
                entry = self._CACHE.get(cache_key)
                if entry and (now_ts - entry.generated_at < self.ttl_sec):
                    return entry.data

        is_sqlite = "sqlite" in str(self.db.bind.url)

        personal_leg = None
        share_leg = None
        if scope in ("personal", "combined"):
            personal_leg = self._compute_personal_leg(user_id, year, month, start_date, end_date, is_sqlite)
        if scope in ("combined", "groups"):
            share_leg = self._compute_share_leg(user_id, year, month, start_date, end_date, is_sqlite, group_id)

        if scope == "groups":
            merged = share_leg
        elif scope == "combined":
            merged = self._merge_legs(personal_leg, share_leg)
        else:
            merged = personal_leg

        top_categories = [c["category"] for c in merged["category_totals"][:5]]

        result: Dict[str, Any] = {
            "top_categories": top_categories,
            "category_totals": merged["category_totals"],
            "monthly_trend": merged["monthly_trend"],
            "total_expenses": merged["total"],
            "category_expense_details": merged["category_expense_details"],
            "filter_info": {
                "applied_user_col": "user_email",
                "year": int(year) if year is not None else None,
                "month": int(month) if month is not None else None,
                "start_date": start_date,
                "end_date": end_date,
                "row_count": merged["row_count"],
                "scope": scope,
                "group_id": group_id,
            },
            "scope": scope,
        }

        if scope in ("combined", "groups"):
            result["spend_breakdown"] = {
                "personal": round(personal_leg["total"], 2) if personal_leg else 0.0,
                "group_share": round(share_leg["total"], 2),
            }
            result["group_summaries"] = self._compute_group_summaries(
                user_id, year, month, start_date, end_date, is_sqlite, group_id
            )
        else:
            result["spend_breakdown"] = None
            result["group_summaries"] = None

        if use_cache:
            with self._CACHE_LOCK:
                self._CACHE[cache_key] = AnalysisResult(result, now_ts)

        return result
