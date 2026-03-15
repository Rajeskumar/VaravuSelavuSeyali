"""
InsightsAggregationService
==========================
Called when expenses (or expense items) are created/updated to keep the
pre-calculated item_insights, item_price_history, merchant_insights, and
merchant_aggregates tables up-to-date.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from varavu_selavu_service.db.models import (
    Expense,
    ExpenseItem,
    ItemInsight,
    ItemPriceHistory,
    MerchantInsight,
    MerchantAggregate,
)

logger = logging.getLogger("varavu_selavu.insights_aggregation")


class InsightsAggregationService:
    """Recalculates item & merchant insight rows after expense mutations."""

    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Public entry points
    # ------------------------------------------------------------------

    def on_expense_with_items_created(
        self,
        user_email: str,
        expense_id: str,
        merchant_name: Optional[str],
        purchased_at: Optional[datetime],
        items: List[Dict[str, Any]],
    ) -> None:
        """Call after a receipt-based expense + items are persisted."""
        self._update_merchant_insight(user_email, merchant_name, purchased_at, float(
            sum(i.get("line_total", 0) for i in items)
        ))
        for item in items:
            self._update_item_insight(
                user_email=user_email,
                expense_id=expense_id,
                store_name=merchant_name,
                purchased_at=purchased_at,
                normalized_name=item.get("normalized_name") or item.get("item_name", "Unknown"),
                unit_price=float(item.get("unit_price") or item.get("line_total", 0)),
                quantity=float(item.get("quantity", 1) or 1),
                line_total=float(item.get("line_total", 0)),
            )
        self.db.commit()

    def on_simple_expense_created(
        self,
        user_email: str,
        merchant_name: Optional[str],
        purchased_at: Optional[datetime],
        amount: float,
    ) -> None:
        """Call after a simple (non-receipt) expense is persisted."""
        self._update_merchant_insight(user_email, merchant_name, purchased_at, amount, count_delta=1)
        self.db.commit()

    def on_simple_expense_updated(
        self,
        user_email: str,
        old_merchant_name: Optional[str],
        old_amount: float,
        old_purchased_at: Optional[datetime],
        new_merchant_name: Optional[str],
        new_amount: float,
        new_purchased_at: Optional[datetime],
    ) -> None:
        """Call after a simple (non-receipt) expense is updated to adjust aggregates."""
        # 1. Back out old values completely (-amount, -1 count)
        if old_merchant_name:
            self._update_merchant_insight(
                user_email, old_merchant_name, old_purchased_at, -old_amount, count_delta=-1
            )
            
        # 2. Add the new values (+amount, +1 count)
        if new_merchant_name:
            self._update_merchant_insight(
                user_email, new_merchant_name, new_purchased_at, new_amount, count_delta=1
            )
            
        self.db.commit()

    # ------------------------------------------------------------------
    # Internal: Item insight helpers
    # ------------------------------------------------------------------

    def _update_item_insight(
        self,
        user_email: str,
        expense_id: str,
        store_name: Optional[str],
        purchased_at: Optional[datetime],
        normalized_name: str,
        unit_price: float,
        quantity: float,
        line_total: float,
    ) -> None:
        insight = (
            self.db.query(ItemInsight)
            .filter(
                ItemInsight.user_email == user_email,
                ItemInsight.normalized_name == normalized_name,
            )
            .first()
        )

        if insight is None:
            insight = ItemInsight(
                id=uuid.uuid4(),
                user_email=user_email,
                normalized_name=normalized_name,
                avg_unit_price=Decimal(str(unit_price)),
                min_price=Decimal(str(unit_price)),
                max_price=Decimal(str(unit_price)),
                total_quantity_bought=Decimal(str(quantity)),
                total_spent=Decimal(str(line_total)),
            )
            self.db.add(insight)
            self.db.flush()  # get insight.id
        else:
            # Recalculate aggregates
            prev_total = float(insight.total_spent or 0)
            prev_qty = float(insight.total_quantity_bought or 0)
            new_total = prev_total + line_total
            new_qty = prev_qty + quantity
            insight.total_spent = Decimal(str(new_total))
            insight.total_quantity_bought = Decimal(str(new_qty))
            insight.avg_unit_price = Decimal(str(new_total / new_qty)) if new_qty else Decimal("0")
            if unit_price < float(insight.min_price or unit_price):
                insight.min_price = Decimal(str(unit_price))
            if unit_price > float(insight.max_price or 0):
                insight.max_price = Decimal(str(unit_price))

        # Append to price history
        history = ItemPriceHistory(
            id=uuid.uuid4(),
            item_insight_id=insight.id,
            expense_id=uuid.UUID(str(expense_id)),
            store_name=store_name,
            date=purchased_at or datetime.utcnow(),
            unit_price=Decimal(str(unit_price)),
            quantity=Decimal(str(quantity)),
        )
        self.db.add(history)

    # ------------------------------------------------------------------
    # Internal: Merchant insight helpers
    # ------------------------------------------------------------------

    def _update_merchant_insight(
        self,
        user_email: str,
        merchant_name: Optional[str],
        purchased_at: Optional[datetime],
        amount: float,
        count_delta: int = 1,
    ) -> None:
        if not merchant_name:
            return  # Can't track without a merchant name

        insight = (
            self.db.query(MerchantInsight)
            .filter(
                MerchantInsight.user_email == user_email,
                MerchantInsight.merchant_name == merchant_name,
            )
            .first()
        )

        if insight is None:
            if count_delta <= 0:
                return  # Don't create if removing
            insight = MerchantInsight(
                id=uuid.uuid4(),
                user_email=user_email,
                merchant_name=merchant_name,
                total_spent=Decimal(str(amount)),
                transaction_count=count_delta,
            )
            self.db.add(insight)
            self.db.flush()
        else:
            insight.total_spent = Decimal(str(float(insight.total_spent or 0) + amount))
            insight.transaction_count = (insight.transaction_count or 0) + count_delta

        # Update monthly aggregate
        dt = purchased_at or datetime.utcnow()
        agg = (
            self.db.query(MerchantAggregate)
            .filter(
                MerchantAggregate.merchant_insight_id == insight.id,
                MerchantAggregate.year == dt.year,
                MerchantAggregate.month == dt.month,
            )
            .first()
        )
        if agg is None:
            if count_delta > 0:
                agg = MerchantAggregate(
                    id=uuid.uuid4(),
                    merchant_insight_id=insight.id,
                    year=dt.year,
                    month=dt.month,
                    total_spent=Decimal(str(amount)),
                    transaction_count=count_delta,
                )
                self.db.add(agg)
        else:
            agg.total_spent = Decimal(str(float(agg.total_spent or 0) + amount))
            agg.transaction_count = (agg.transaction_count or 0) + count_delta
