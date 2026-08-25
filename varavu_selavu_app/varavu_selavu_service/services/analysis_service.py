from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
import time
import uuid
from typing import Any, Dict, Optional, Tuple, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, Integer
from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, ExpenseTag, Group, GroupMember


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

    def _tag_filter_condition(self, user_id: str, tag_ids: Optional[List[str]]):
        """TS-TAG-106: `Expense.id.in_(...)` predicate for OR-semantics tag filtering (PRD
        §10.4/§7.4 — Overview/Items/Merchants all scope to this when a tag filter is active).
        Filters `expense_tags` by `user_email` like every other tag read path (PRD §9.2) — a tag
        filter can never surface an expense via someone else's private tag on a shared expense."""
        if not tag_ids:
            return None
        parsed_ids = [t for t in (_to_uuid(t) for t in tag_ids) if t is not None]
        if not parsed_ids:
            return None
        subq = (
            self.db.query(ExpenseTag.expense_id)
            .filter(ExpenseTag.tag_id.in_(parsed_ids), ExpenseTag.user_email == user_id)
            .subquery()
        )
        return Expense.id.in_(subq)

    # --------------------------------------------------------------------------------
    # Personal leg — unchanged behavior for scope=personal, plus a group_id IS NULL
    # guard for personal/combined so group expenses (user_email=creator) aren't
    # double-counted the moment group_id exists (spec §9.1).
    # --------------------------------------------------------------------------------

    def _compute_personal_leg(self, user_id, year, month, start_date, end_date, is_sqlite, tag_ids=None) -> Dict[str, Any]:
        filters = [Expense.user_email == user_id, Expense.group_id.is_(None)]
        filters += self._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite)
        tag_condition = self._tag_filter_condition(user_id, tag_ids)
        if tag_condition is not None:
            filters.append(tag_condition)

        category_totals: List[Dict[str, Any]] = []
        monthly_trend: List[Dict[str, Any]] = []
        total = 0.0
        category_expense_details: Dict[str, list] = {}

        row_count = self.db.query(func.count(Expense.id)).filter(*filters).scalar() or 0

        if row_count > 0:
            total_val = self.db.query(func.sum(Expense.amount)).filter(*filters).scalar()
            total = round(float(total_val), 2) if total_val else 0.0

            cat_results = self.db.query(
                Expense.category_id,
                func.sum(Expense.amount).label('cost')
            ).filter(*filters).group_by(Expense.category_id).order_by(func.sum(Expense.amount).desc()).all()

            for r in cat_results:
                cat_name = r[0] or "Uncategorized"
                val = round(float(r[1]), 2)
                category_totals.append({"category": cat_name, "total": val})

            month_expr = self._month_expr(Expense.purchased_at, is_sqlite)
            trend_results = self.db.query(
                month_expr.label('month'),
                func.sum(Expense.amount).label('total')
            ).filter(*filters).group_by(month_expr).order_by(month_expr.asc()).all()

            for r in trend_results:
                if r[0]:
                    monthly_trend.append({"month": r[0], "total": round(float(r[1]), 2)})

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



    def _compute_group_leg(self, user_id, year, month, start_date, end_date, is_sqlite, group_id=None, mode="my_share", tag_ids=None) -> Dict[str, Any]:
        from varavu_selavu_service.db.models import ExpensePayer, ExpenseSplit, Expense, GroupMember
        
        if mode == "my_share":
            query = (
                self.db.query(ExpenseSplit, Expense)
                .join(GroupMember, GroupMember.id == ExpenseSplit.member_id)
                .join(Expense, Expense.id == ExpenseSplit.expense_id)
                .filter(GroupMember.user_email == user_id)
            )
        elif mode == "i_paid":
            query = (
                self.db.query(ExpensePayer, Expense)
                .join(GroupMember, GroupMember.id == ExpensePayer.member_id)
                .join(Expense, Expense.id == ExpensePayer.expense_id)
                .filter(GroupMember.user_email == user_id)
            )
        elif mode == "group_total":
            user_groups = self.db.query(GroupMember.group_id).filter(GroupMember.user_email == user_id).subquery()
            query = (
                self.db.query(Expense)
                .filter(Expense.group_id.in_(user_groups))
            )
        
        if group_id:
            gid = _to_uuid(group_id)
            if gid is not None:
                query = query.filter(Expense.group_id == gid)
        elif mode in ("i_paid", "group_total"):
            query = query.filter(Expense.group_id.isnot(None))
            
        query = query.filter(*self._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite))

        tag_condition = self._tag_filter_condition(user_id, tag_ids)
        if tag_condition is not None:
            query = query.filter(tag_condition)

        category_sums = {}
        month_sums = {}
        details = {}
        total = 0.0
        row_count = 0

        # For mode=my_share, we get (ExpenseSplit, Expense)
        # For mode=i_paid, we get (ExpensePayer, Expense)
        # For mode=group_total, we just get Expense, so we map it to (None, Expense)
        if mode == "group_total":
            results = [(None, exp) for exp in query.all()]
        else:
            results = query.all()

        for aux, expense in results:
            row_count += 1
            if mode == "my_share":
                amt = float(aux.amount_owed or 0)
            elif mode == "i_paid":
                amt = float(aux.amount_paid or 0)
            else:
                amt = float(expense.amount or 0)
                
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

        # Rounded at the aggregation boundary: accumulating floats otherwise
        # surfaces artifacts like 306.49999999999994 in the UI.
        category_totals = [{"category": k, "total": round(v, 2)} for k, v in sorted(category_sums.items(), key=lambda kv: -kv[1])]
        monthly_trend = [{"month": k, "total": round(v, 2)} for k, v in sorted(month_sums.items())]

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
            {"category": k, "total": round(v, 2)} for k, v in sorted(category_sums.items(), key=lambda kv: -kv[1])
        ]

        month_sums: Dict[str, float] = {}
        for leg in (personal_leg, share_leg):
            for m in leg["monthly_trend"]:
                month_sums[m["month"]] = month_sums.get(m["month"], 0.0) + m["total"]
        monthly_trend = [{"month": k, "total": round(v, 2)} for k, v in sorted(month_sums.items())]

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
    # TS-CARD-113: (category, merchant) cross-tab for Card Coach's merchant-rule precedence.
    # Deliberately NOT built on category_totals/merchant totals as two independent single-
    # dimension sums — CardRewardsEngine needs to know how much of a given category's spend
    # happened at a specific merchant to resolve merchant-vs-category rule precedence correctly
    # per dollar, not per whole-category or whole-merchant total (spec discussion: a $100 Apple
    # purchase must use Apple's own rule even when rolled up into the "Electronics" category
    # view, not silently fall back to Electronics' rate). Reuses the same i_paid group-share
    # handling as analyze() (spec §8.2) rather than MerchantInsight/MerchantAggregate, which
    # record each member's split share for group expenses, not the full amount paid.
    # --------------------------------------------------------------------------------

    def compute_category_merchant_buckets(
        self,
        user_id: str,
        year: Optional[int] = None,
        month: Optional[int] = None,
        start_date: str | None = None,
        end_date: str | None = None,
        include_group_i_paid: bool = False,
    ) -> List[Dict[str, Any]]:
        """Returns [{"category": str, "merchant": Optional[str], "card_id": Optional[str],
        "total": float}, ...] — one row per distinct (category, merchant, card_id) combination
        with nonzero spend. `merchant` is None for expenses with no merchant captured (matches
        Expense.merchant_name being nullable). `card_id` (TS-CARD-114) is None for expenses with
        no held-card attribution — CardRewardsEngine treats those as "assume the default card,"
        never as "assume no card/no reward." Bucketing by card_id (not just category/merchant)
        is what lets the engine apply each dollar's *actual* attributed card instead of blindly
        crediting 100% of a category's spend to the default card."""
        is_sqlite = "sqlite" in str(self.db.bind.url)
        buckets: Dict[Tuple[str, Optional[str], Optional[str]], float] = {}

        personal_filters = [Expense.user_email == user_id, Expense.group_id.is_(None)]
        personal_filters += self._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite)
        personal_rows = (
            self.db.query(Expense.category_id, Expense.merchant_name, Expense.card_id, func.sum(Expense.amount))
            .filter(*personal_filters)
            .group_by(Expense.category_id, Expense.merchant_name, Expense.card_id)
            .all()
        )
        for cat, merchant, card_id, amt in personal_rows:
            key = (cat or "Uncategorized", merchant or None, str(card_id) if card_id else None)
            buckets[key] = buckets.get(key, 0.0) + float(amt or 0)

        if include_group_i_paid:
            group_filters = [Expense.group_id.isnot(None)]
            group_filters += self._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite)
            group_rows = (
                self.db.query(Expense.category_id, Expense.merchant_name, Expense.card_id, func.sum(ExpensePayer.amount_paid))
                .join(ExpensePayer, ExpensePayer.expense_id == Expense.id)
                .join(GroupMember, GroupMember.id == ExpensePayer.member_id)
                .filter(GroupMember.user_email == user_id)
                .filter(*group_filters)
                .group_by(Expense.category_id, Expense.merchant_name, Expense.card_id)
                .all()
            )
            for cat, merchant, card_id, amt in group_rows:
                key = (cat or "Uncategorized", merchant or None, str(card_id) if card_id else None)
                buckets[key] = buckets.get(key, 0.0) + float(amt or 0)

        return [
            {"category": cat, "merchant": merchant, "card_id": card_id, "total": round(total, 2)}
            for (cat, merchant, card_id), total in buckets.items()
            if total > 0
        ]

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
            tag_ids: List[str] | None = None,
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
            tuple(sorted(tag_ids)) if tag_ids else None,
        )

        now_ts = time.time()

        if use_cache:
            with self._CACHE_LOCK:
                entry = self._CACHE.get(cache_key)
                if entry and (now_ts - entry.generated_at < self.ttl_sec):
                    return entry.data

        is_sqlite = "sqlite" in str(self.db.bind.url)


        personal_leg = None
        group_leg = None
        if scope in ("personal", "combined", "i_paid", "group_total"):
            personal_leg = self._compute_personal_leg(user_id, year, month, start_date, end_date, is_sqlite, tag_ids=tag_ids)
        if scope in ("combined", "groups"):
            group_leg = self._compute_group_leg(user_id, year, month, start_date, end_date, is_sqlite, group_id, "my_share", tag_ids=tag_ids)
        elif scope == "i_paid":
            group_leg = self._compute_group_leg(user_id, year, month, start_date, end_date, is_sqlite, group_id, "i_paid", tag_ids=tag_ids)
        elif scope == "group_total":
            group_leg = self._compute_group_leg(user_id, year, month, start_date, end_date, is_sqlite, group_id, "group_total", tag_ids=tag_ids)

        if scope == "groups":
            merged = group_leg
        elif scope in ("combined", "i_paid", "group_total"):
            merged = self._merge_legs(personal_leg, group_leg)
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
                "tag_ids": tag_ids,
            },
            "scope": scope,
        }


        if scope in ("combined", "groups", "i_paid", "group_total"):
            result["spend_breakdown"] = {
                "personal": round(personal_leg["total"], 2) if personal_leg else 0.0,
                "group_share": round(group_leg["total"] if group_leg else 0.0, 2),
            }

            result["group_summaries"] = self._compute_group_summaries(
                user_id, year, month, start_date, end_date, is_sqlite, group_id
            )
        else:
            result["spend_breakdown"] = None
            result["group_summaries"] = None

        # TS-TAG-106 (PRD §10.4): when tag-filtered, always surface BOTH share-aware totals
        # regardless of `scope` — reuses the exact same _compute_personal_leg/_compute_group_leg
        # methods above (PRD §4.1: never reimplement the share-computation path), just called
        # again with the mode the requested `scope` didn't already compute.
        if tag_ids:
            my_share_personal = personal_leg if personal_leg is not None else self._compute_personal_leg(
                user_id, year, month, start_date, end_date, is_sqlite, tag_ids=tag_ids,
            )
            my_share_group = group_leg if scope in ("combined", "groups") else self._compute_group_leg(
                user_id, year, month, start_date, end_date, is_sqlite, group_id, "my_share", tag_ids=tag_ids,
            )
            i_paid_group = group_leg if scope == "i_paid" else self._compute_group_leg(
                user_id, year, month, start_date, end_date, is_sqlite, group_id, "i_paid", tag_ids=tag_ids,
            )
            result["my_expenses_total"] = round(my_share_personal["total"] + my_share_group["total"], 2)
            result["i_paid_total"] = round(my_share_personal["total"] + i_paid_group["total"], 2)
        else:
            result["my_expenses_total"] = None
            result["i_paid_total"] = None

        if use_cache:
            with self._CACHE_LOCK:
                self._CACHE[cache_key] = AnalysisResult(result, now_ts)

        return result
