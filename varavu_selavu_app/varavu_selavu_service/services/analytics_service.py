"""
AnalyticsService
================
Read-side service that queries the pre-calculated item_insights,
item_price_history, merchant_insights, and merchant_aggregates tables
to return data for the dedicated UI screens and for RAG context injection.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from varavu_selavu_service.db.models import (
    ItemInsight,
    ItemPriceHistory,
    MerchantInsight,
    MerchantAggregate,
    ExpenseItem,
    Expense,
)
from varavu_selavu_service.services.insight_analytics_service import classify_confidence

logger = logging.getLogger("varavu_selavu.analytics_service")


class AnalyticsService:
    """Fetches pre-calculated item & merchant insights for API / RAG."""

    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Item Insights
    # ------------------------------------------------------------------

    def get_top_items(
        self, user_email: str, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Return top items by total spend for a user."""
        rows = (
            self.db.query(ItemInsight)
            .filter(ItemInsight.user_email == user_email)
            .order_by(desc(ItemInsight.total_spent))
            .limit(limit)
            .all()
        )
        return [self._item_insight_to_dict(r) for r in rows]

    def get_item_detail(
        self, user_email: str, item_name: str
    ) -> Optional[Dict[str, Any]]:
        """Return full detail for a specific item including price history."""
        insight = (
            self.db.query(ItemInsight)
            .filter(
                ItemInsight.user_email == user_email,
                ItemInsight.normalized_name == item_name,
            )
            .first()
        )
        if not insight:
            return None

        history = (
            self.db.query(ItemPriceHistory)
            .filter(ItemPriceHistory.item_insight_id == insight.id)
            .order_by(ItemPriceHistory.date.asc())
            .all()
        )

        # Build store comparison: group by store_name
        store_map: Dict[str, List[float]] = {}
        for h in history:
            store = h.store_name or "Unknown"
            store_map.setdefault(store, []).append(float(h.unit_price))

        store_comparison = [
            {
                "store_name": store,
                "avg_price": round(sum(ps) / len(ps), 2),
                "min_price": round(min(ps), 2),
                "max_price": round(max(ps), 2),
                "purchase_count": len(ps),
            }
            for store, ps in store_map.items()
        ]

        # TS-ANL-009: don't let a "cheapest merchant" claim stand on a single
        # store — require at least 2 distinct stores before comparing prices.
        if len(store_comparison) < 2:
            store_comparison = []

        return {
            **self._item_insight_to_dict(insight),
            "confidence": classify_confidence(len(history), len(store_map)),
            "price_history": [
                {
                    "date": h.date.isoformat() if h.date else None,
                    "store_name": h.store_name,
                    "unit_price": float(h.unit_price),
                    "quantity": float(h.quantity or 1),
                }
                for h in history
            ],
            "store_comparison": store_comparison,
        }

    def search_items(
        self, user_email: str, query: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Fuzzy search items by normalized_name (ILIKE)."""
        rows = (
            self.db.query(ItemInsight)
            .filter(
                ItemInsight.user_email == user_email,
                ItemInsight.normalized_name.ilike(f"%{query}%"),
            )
            .order_by(desc(ItemInsight.total_spent))
            .limit(limit)
            .all()
        )
        return [self._item_insight_to_dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Merchant Insights
    # ------------------------------------------------------------------

    def get_top_merchants(
        self, user_email: str, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Return top merchants by total spend for a user."""
        rows = (
            self.db.query(MerchantInsight)
            .filter(MerchantInsight.user_email == user_email)
            .order_by(desc(MerchantInsight.total_spent))
            .limit(limit)
            .all()
        )
        return [self._merchant_insight_to_dict(r) for r in rows]

    def get_merchant_detail(
        self, user_email: str, merchant_name: str
    ) -> Optional[Dict[str, Any]]:
        """Return full detail for a merchant including monthly aggregates and items bought."""
        insight = (
            self.db.query(MerchantInsight)
            .filter(
                MerchantInsight.user_email == user_email,
                MerchantInsight.merchant_name == merchant_name,
            )
            .first()
        )
        if not insight:
            return None

        # Monthly/yearly aggregates
        aggs = (
            self.db.query(MerchantAggregate)
            .filter(MerchantAggregate.merchant_insight_id == insight.id)
            .order_by(MerchantAggregate.year.asc(), MerchantAggregate.month.asc())
            .all()
        )
        monthly_aggregates = [
            {
                "year": a.year,
                "month": a.month,
                "total_spent": float(a.total_spent or 0),
                "transaction_count": a.transaction_count or 0,
            }
            for a in aggs
        ]

        # Items bought at this merchant (via ItemPriceHistory.store_name)
        item_rows = (
            self.db.query(ItemPriceHistory)
            .join(ItemInsight, ItemPriceHistory.item_insight_id == ItemInsight.id)
            .filter(
                ItemInsight.user_email == user_email,
                ItemPriceHistory.store_name == merchant_name,
            )
            .all()
        )
        # Group by item name
        items_map: Dict[str, Dict[str, Any]] = {}
        for r in item_rows:
            # Look up the insight for this row
            item_insight = self.db.query(ItemInsight).filter(ItemInsight.id == r.item_insight_id).first()
            name = item_insight.normalized_name if item_insight else "Unknown"
            if name not in items_map:
                items_map[name] = {"item_name": name, "prices": [], "total_quantity": 0}
            items_map[name]["prices"].append(float(r.unit_price))
            items_map[name]["total_quantity"] += float(r.quantity or 1)

        items_bought = [
            {
                "item_name": v["item_name"],
                "avg_price": round(sum(v["prices"]) / len(v["prices"]), 2),
                "purchase_count": len(v["prices"]),
                "total_quantity": v["total_quantity"],
            }
            for v in items_map.values()
        ]

        # Recent transactions + biggest single transaction at this merchant
        recent_expenses = (
            self.db.query(Expense)
            .filter(Expense.user_email == user_email, Expense.merchant_name == merchant_name)
            .order_by(Expense.purchased_at.desc())
            .limit(10)
            .all()
        )
        recent_transactions = [
            {
                "date": e.purchased_at.isoformat() if e.purchased_at else None,
                "description": e.description,
                "amount": float(e.amount or 0),
            }
            for e in recent_expenses
        ]

        highest_expense = (
            self.db.query(Expense)
            .filter(Expense.user_email == user_email, Expense.merchant_name == merchant_name)
            .order_by(desc(Expense.amount))
            .first()
        )
        highest_transaction = (
            {
                "date": highest_expense.purchased_at.isoformat() if highest_expense.purchased_at else None,
                "amount": float(highest_expense.amount or 0),
            }
            if highest_expense
            else None
        )

        # Spend share vs. all of this user's merchants (all-time, since this
        # code path is only used when no date scope was requested)
        total_all_merchants = float(
            self.db.query(func.sum(MerchantInsight.total_spent))
            .filter(MerchantInsight.user_email == user_email)
            .scalar()
            or 0
        )
        spend_share_percent = (
            round((float(insight.total_spent or 0) / total_all_merchants) * 100, 1)
            if total_all_merchants > 0
            else None
        )
        average_transaction_amount = (
            round(float(insight.total_spent or 0) / insight.transaction_count, 2)
            if insight.transaction_count
            else 0
        )

        return {
            **self._merchant_insight_to_dict(insight),
            "monthly_aggregates": monthly_aggregates,
            "items_bought": items_bought,
            "recent_transactions": recent_transactions,
            "highest_transaction": highest_transaction,
            "average_transaction_amount": average_transaction_amount,
            "spend_share_percent": spend_share_percent,
            "confidence": classify_confidence(insight.transaction_count or 0),
        }

    def search_merchants(
        self, user_email: str, query: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Fuzzy search merchants by name (ILIKE)."""
        rows = (
            self.db.query(MerchantInsight)
            .filter(
                MerchantInsight.user_email == user_email,
                MerchantInsight.merchant_name.ilike(f"%{query}%"),
            )
            .order_by(desc(MerchantInsight.total_spent))
            .limit(limit)
            .all()
        )
        return [self._merchant_insight_to_dict(r) for r in rows]

    # ------------------------------------------------------------------
    # RAG context builder (for chat)
    # ------------------------------------------------------------------

    def build_rag_context(
        self, user_email: str, query: str
    ) -> Optional[Dict[str, Any]]:
        """
        Attempt to detect if the user's query references a specific item or
        merchant.  If so, return a small focused context dict.  Otherwise
        return None so the caller falls back to the general AnalysisResult.
        """
        # Very simple keyword matching – search items first, then merchants
        item_results = self.search_items(user_email, query, limit=3)
        if item_results:
            # Get detailed context for the best match
            best = item_results[0]
            detail = self.get_item_detail(user_email, best["normalized_name"])
            if detail:
                return {"type": "item_insight", "data": detail}

        merchant_results = self.search_merchants(user_email, query, limit=3)
        if merchant_results:
            best = merchant_results[0]
            detail = self.get_merchant_detail(user_email, best["merchant_name"])
            if detail:
                return {"type": "merchant_insight", "data": detail}

        return None

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _item_insight_to_dict(row: ItemInsight) -> Dict[str, Any]:
        return {
            "id": str(row.id),
            "normalized_name": row.normalized_name,
            "avg_unit_price": float(row.avg_unit_price or 0),
            "min_price": float(row.min_price or 0),
            "max_price": float(row.max_price or 0),
            "total_quantity_bought": float(row.total_quantity_bought or 0),
            "total_spent": float(row.total_spent or 0),
        }

    @staticmethod
    def _merchant_insight_to_dict(row: MerchantInsight) -> Dict[str, Any]:
        return {
            "id": str(row.id),
            "merchant_name": row.merchant_name,
            "total_spent": float(row.total_spent or 0),
            "transaction_count": row.transaction_count or 0,
        }
