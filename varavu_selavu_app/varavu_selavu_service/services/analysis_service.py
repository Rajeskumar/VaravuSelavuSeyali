from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
import time
from typing import Any, Dict, Optional, Tuple, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, Integer
from varavu_selavu_service.db.models import Expense


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

    # Cache key: (user_id, year, month) -> AnalysisResult
    _CACHE: Dict[Tuple[str, Optional[int], Optional[int], Optional[str], Optional[str]], AnalysisResult] = {}
    _CACHE_LOCK: RLock = RLock()

    def __init__(self, db: Session, ttl_sec: int = 60):
        self.db = db
        self.ttl_sec = ttl_sec

    def invalidate_cache(self) -> None:
        with self._CACHE_LOCK:
            self._CACHE.clear()

    def analyze(
            self,
            user_id: str,
            year: Optional[int] = None,
            month: Optional[int] = None,
            start_date: str | None = None,
            end_date: str | None = None,
            use_cache: bool = True,
    ) -> Dict[str, Any]:
        cache_key = (
            user_id,
            int(year) if year is not None else None,
            int(month) if month is not None else None,
            start_date,
            end_date,
        )

        now_ts = time.time()

        if use_cache:
            with self._CACHE_LOCK:
                entry = self._CACHE.get(cache_key)
                if entry and (now_ts - entry.generated_at < self.ttl_sec):
                    return entry.data

        # --------------------------------------------------------------------------------
        # 1. Build dynamic ORM Filters
        # --------------------------------------------------------------------------------
        filters = [Expense.user_email == user_id]
        
        if start_date:
            filters.append(Expense.purchased_at >= start_date)
        if end_date:
            filters.append(Expense.purchased_at <= end_date)
            
        is_sqlite = "sqlite" in str(self.db.bind.url)
        if year is not None:
            if is_sqlite:
                filters.append(func.cast(func.strftime('%Y', Expense.purchased_at), Integer) == int(year))
            else:
                filters.append(extract('year', Expense.purchased_at) == int(year))
                
        if month is not None:
            if is_sqlite:
                filters.append(func.cast(func.strftime('%m', Expense.purchased_at), Integer) == int(month))
            else:
                filters.append(extract('month', Expense.purchased_at) == int(month))

        # --------------------------------------------------------------------------------
        # 2. Execute Analyis Queries
        # --------------------------------------------------------------------------------
        top_categories = []
        category_totals = []
        monthly_trend = []
        total_expenses = 0.0
        category_expense_details: Dict[str, list] = {}
        
        row_count = self.db.query(func.count(Expense.id)).filter(*filters).scalar() or 0

        if row_count > 0:
            total_val = self.db.query(func.sum(Expense.amount)).filter(*filters).scalar()
            total_expenses = float(total_val) if total_val else 0.0

            cat_results = self.db.query(
                Expense.category_id, 
                func.sum(Expense.amount).label('cost')
            ).filter(*filters).group_by(Expense.category_id).order_by(func.sum(Expense.amount).desc()).all()
            
            for r in cat_results:
                cat_name = r[0] or "Uncategorized"
                val = float(r[1])
                category_totals.append({"category": cat_name, "total": val})
                if len(top_categories) < 5:
                    top_categories.append(cat_name)

            if is_sqlite:
                month_expr = func.strftime('%Y-%m', Expense.purchased_at)
            else:
                month_expr = func.to_char(func.date_trunc('month', Expense.purchased_at), 'YYYY-MM')

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

        result: Dict[str, Any] = {
            "top_categories": top_categories,
            "category_totals": category_totals,
            "monthly_trend": monthly_trend,
            "total_expenses": total_expenses,
            "category_expense_details": category_expense_details,
            "filter_info": {
                "applied_user_col": "user_email",
                "year": int(year) if year is not None else None,
                "month": int(month) if month is not None else None,
                "start_date": start_date,
                "end_date": end_date,
                "row_count": row_count,
            },
        }

        if use_cache:
            with self._CACHE_LOCK:
                self._CACHE[cache_key] = AnalysisResult(result, now_ts)

        return result
