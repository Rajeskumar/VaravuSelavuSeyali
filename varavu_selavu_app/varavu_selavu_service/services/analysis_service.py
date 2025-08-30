from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
import time
from typing import Any, Dict, Optional, Tuple

import pandas as pd

from varavu_selavu_service.services.expense_service import ExpenseService


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
    _CACHE: Dict[Tuple[str, Optional[int], Optional[int]], AnalysisResult] = {}
    _CACHE_LOCK: RLock = RLock()

    def __init__(self, expense_service: Optional[ExpenseService] = None, ttl_sec: int = 60):
        self.expense_service = expense_service or ExpenseService()
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

        df = self.expense_service.load_dataframe()
        if df.empty:
            result = {
                "top_categories": [],
                "category_totals": [],
                "monthly_trend": [],
                "total_expenses": 0.0,
                "category_expense_details": {},
                "filter_info": {
                    "applied_user_col": None,
                    "year": int(year) if year is not None else None,
                    "month": int(month) if month is not None else None,
                    "row_count": 0,
                },
            }
            if use_cache:
                with self._CACHE_LOCK:
                    self._CACHE[cache_key] = AnalysisResult(result, now_ts)
            return result

        # Normalize column names
        df = df.copy()
        df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]

        # Filter by user. If there is a user-identifying column but no rows
        # match the current user, return an empty dataset rather than leaking
        # all rows. If no suitable user column exists, also return empty.
        applied_user_filter = None
        candidate_user_cols = [c for c in df.columns if ("user" in c or "email" in c)]
        found_col = None
        for col in ["user_id", "email", "user", *candidate_user_cols]:
            if col in df.columns:
                found_col = col
                tmp = df[df[col] == user_id]
                df = tmp  # even if empty, enforce per-user isolation
                applied_user_filter = col
                break
        if found_col is None:
            # No recognizable user column -> do not return global data
            df = df.iloc[0:0]

        # Determine date column
        date_col: Optional[str] = "date" if "date" in df.columns else None
        if date_col is None:
            for c in df.columns:
                if "date" in c:
                    date_col = c
                    break
        if date_col:
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            if df[date_col].isna().mean() > 0.5:
                df[date_col] = pd.to_datetime(df[date_col], errors="coerce", dayfirst=True)
        if "cost" in df.columns:
            df["cost"] = pd.to_numeric(df["cost"], errors="coerce")

        required_cols = [c for c in [date_col, "cost"] if c]
        if required_cols:
            df = df.dropna(subset=required_cols)

        # Filters
        if date_col:
            if start_date:
                df = df[df[date_col] >= pd.to_datetime(start_date)]
            if end_date:
                df = df[df[date_col] <= pd.to_datetime(end_date)]
            if year is not None:
                df = df[df[date_col].dt.year == int(year)]
            if month is not None:
                df = df[df[date_col].dt.month == int(month)]

        # Category totals and top categories
        category_totals = []
        if "category" in df.columns:
            cat = df.groupby("category")["cost"].sum().sort_values(ascending=False)
            top_categories = cat.index.tolist()[:5]
            category_totals = [{"category": k, "total": float(v)} for k, v in cat.items()]
        else:
            top_categories = []

        # Monthly trend
        monthly_trend = []
        if date_col:
            trend = (
                df.assign(YearMonth=df[date_col].dt.to_period("M").dt.to_timestamp())
                .groupby("YearMonth")["cost"].sum().reset_index()
            )
            monthly_trend = [
                {"month": r["YearMonth"].strftime("%Y-%m"), "total": float(r["cost"])}
                for _, r in trend.iterrows()
            ]

        total_expenses = float(df["cost"].sum()) if "cost" in df.columns else 0.0

        # Category expense details when specific month is selected
        category_expense_details: Dict[str, list] = {}
        if "category" in df.columns:
            for cat_name, g in df.groupby("category"):
                details = [
                    {
                        "date": (
                            r[date_col].strftime("%Y-%m-%d")
                            if date_col and (date_col in r) and not pd.isna(r[date_col])
                            else ""
                        ),
                        "description": str(r.get("description", "")),
                        "category": str(r.get("category", "")),
                        "cost": float(r.get("cost", 0) or 0),
                    }
                    for _, r in g.iterrows()
                ]
                category_expense_details[cat_name] = details

        result: Dict[str, Any] = {
            "top_categories": top_categories,
            "category_totals": category_totals,
            "monthly_trend": monthly_trend,
            "total_expenses": total_expenses,
            "category_expense_details": category_expense_details,
            "filter_info": {
                "applied_user_col": applied_user_filter,
                "year": int(year) if year is not None else None,
                "month": int(month) if month is not None else None,
                "start_date": start_date,
                "end_date": end_date,
                "row_count": int(len(df)),
            },
        }

        if use_cache:
            with self._CACHE_LOCK:
                self._CACHE[cache_key] = AnalysisResult(result, now_ts)

        return result
