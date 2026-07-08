from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, Integer
import time
from threading import RLock

from varavu_selavu_service.db.models import Expense, ExpenseItem, GroupMember, RecurringTemplate
from varavu_selavu_service.models.api_models import InsightMetrics, MerchantInsightSummary, ItemInsightSummary, ChangeInsight


def classify_confidence(transaction_count: int, distinct_merchants: int | None = None) -> str:
    """
    TS-ANL-009 confidence classification. `distinct_merchants` only matters for
    items (it gates "cheapest merchant" style claims on real store diversity);
    pass None for merchants, where only sample size applies.
    """
    if transaction_count >= 6 and (distinct_merchants is None or distinct_merchants >= 2):
        return "high"
    if transaction_count >= 3:
        return "medium"
    return "low"


def canonicalize_name(name: str | None) -> str:
    """Lightweight canonicalization for grouping near-duplicate merchant names
    that differ only in whitespace/case (e.g. "Walmart " vs "WALMART")."""
    return (name or "").strip().lower()


class InsightAnalyticsService:
    """
    Core service to dynamically calculate InsightMetrics for merchants, items, and changes.
    Applies unified date-scoping: custom start/end > year/month > all-time.
    """

    def __init__(self, db: Session):
        self.db = db

    def _build_date_filters(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        year: int | None = None,
        month: int | None = None,
    ) -> list:
        """
        Builds dynamic datetime filters based on precedence rules.
        Precedence:
          1. start_date / end_date
          2. year / month
          3. all-time (no filters)
        """
        filters = []
        is_sqlite = "sqlite" in str(self.db.bind.url)

        if start_date or end_date:
            if start_date:
                filters.append(Expense.purchased_at >= start_date)
            if end_date:
                filters.append(Expense.purchased_at <= end_date)
        else:
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

        return filters

    def _resolve_comparison_periods(
        self,
        start_date: str | None,
        end_date: str | None,
        year: int | None,
        month: int | None,
        default_to_current_month: bool = False,
    ) -> Optional[tuple]:
        """
        Resolves the current and previous comparison periods used for
        period-over-period change calculations, following the same
        precedence rules as `_build_date_filters`:
          1. year + month -> month-over-month (vs. prior calendar month)
          2. year only -> year-over-year (vs. prior calendar year)
          3. start_date + end_date -> custom range vs. an equal-length prior range
          4. nothing -> only resolved if `default_to_current_month` is True
             (used by change-insight cards, which always need a comparison);
             otherwise returns None so all-time summaries don't get a
             misleading "vs last month" delta attached.

        Returns (curr_start, curr_end, prev_start, prev_end) as ISO date
        strings, or None if there's nothing sensible to compare against.
        """
        curr_start = curr_end = prev_start = prev_end = None

        if year is not None and month is not None:
            curr_start = date(year, month, 1)
            if month == 12:
                curr_end = date(year + 1, 1, 1) - timedelta(days=1)
                prev_start = date(year, 11, 1)
                prev_end = date(year, 12, 1) - timedelta(days=1)
            elif month == 1:
                curr_end = date(year, 2, 1) - timedelta(days=1)
                prev_start = date(year - 1, 12, 1)
                prev_end = date(year, 1, 1) - timedelta(days=1)
            else:
                curr_end = date(year, month + 1, 1) - timedelta(days=1)
                prev_start = date(year, month - 1, 1)
                prev_end = date(year, month, 1) - timedelta(days=1)
        elif year is not None:
            curr_start = date(year, 1, 1)
            curr_end = date(year, 12, 31)
            prev_start = date(year - 1, 1, 1)
            prev_end = date(year - 1, 12, 31)
        elif start_date and end_date:
            curr_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            curr_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            delta = curr_end - curr_start
            prev_end = curr_start - timedelta(days=1)
            prev_start = prev_end - delta
        elif default_to_current_month:
            today = date.today()
            curr_start = date(today.year, today.month, 1)
            curr_end = None
            if today.month == 1:
                prev_start = date(today.year - 1, 12, 1)
            else:
                prev_start = date(today.year, today.month - 1, 1)
            prev_end = curr_start - timedelta(days=1)

        if not curr_start or not prev_start:
            return None

        return (
            curr_start.strftime("%Y-%m-%d"),
            curr_end.strftime("%Y-%m-%d") if curr_end else None,
            prev_start.strftime("%Y-%m-%d"),
            prev_end.strftime("%Y-%m-%d") if prev_end else None,
        )

    def _merchant_totals_for_period(
        self, user_id: str, start_date: str | None, end_date: str | None
    ) -> Dict[str, float]:
        """Canonicalized merchant -> total_spent lookup for a raw date range (no year/month precedence)."""
        # group_id.is_(None): personal-only, same guard AnalysisService established
        # (TS-GRP-106) — without it a user's own group expenses would be counted
        # here at their *full* amount on top of actual personal spend.
        canon_key = func.lower(func.trim(Expense.merchant_name))
        query = self.db.query(canon_key, func.sum(Expense.amount)).filter(
            Expense.user_email == user_id, Expense.group_id.is_(None), Expense.merchant_name != None
        )
        if start_date:
            query = query.filter(Expense.purchased_at >= start_date)
        if end_date:
            query = query.filter(Expense.purchased_at <= end_date)
        return {r[0]: float(r[1] or 0) for r in query.group_by(canon_key).all()}

    def _item_totals_for_period(
        self, user_id: str, start_date: str | None, end_date: str | None
    ) -> Dict[str, float]:
        """Lightweight item -> average_unit_price lookup for a raw date range (no year/month precedence)."""
        query = (
            self.db.query(ExpenseItem.normalized_name, func.avg(ExpenseItem.unit_price))
            .join(Expense, ExpenseItem.expense_id == Expense.id)
            .filter(Expense.user_email == user_id, Expense.group_id.is_(None), ExpenseItem.normalized_name != None)
        )
        if start_date:
            query = query.filter(Expense.purchased_at >= start_date)
        if end_date:
            query = query.filter(Expense.purchased_at <= end_date)
        return {r[0]: float(r[1] or 0) for r in query.group_by(ExpenseItem.normalized_name).all()}

    def calculate_merchant_metrics(
        self,
        user_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
        year: int | None = None,
        month: int | None = None,
        limit: int = 20,
    ) -> List[MerchantInsightSummary]:
        """
        Calculates insight metrics grouped by merchant. Uses all expenses with a non-null merchant_name.
        """
        date_filters = self._build_date_filters(start_date, end_date, year, month)

        # Group by a canonicalized (trimmed/lowercased) key so "Walmart" and
        # "WALMART " don't split into separate rows (TS-ANL-009 canonicalization),
        # but still display a real, human-readable merchant name.
        canon_key = func.lower(func.trim(Expense.merchant_name))
        query = (
            self.db.query(
                canon_key.label("canon_name"),
                func.min(Expense.merchant_name).label("merchant_name"),
                func.sum(Expense.amount).label("total_spent"),
                func.count(Expense.id).label("transaction_count"),
                func.min(Expense.purchased_at).label("first_seen"),
                func.max(Expense.purchased_at).label("last_seen"),
            )
            .filter(Expense.user_email == user_id)
            .filter(Expense.group_id.is_(None))
            .filter(Expense.merchant_name != None)
            .filter(*date_filters)
            .group_by(canon_key)
            .order_by(func.sum(Expense.amount).desc())
            .limit(limit)
        )

        results = query.all()

        periods = self._resolve_comparison_periods(start_date, end_date, year, month)
        prev_totals = (
            self._merchant_totals_for_period(user_id, periods[2], periods[3]) if periods else {}
        )

        summaries = []
        for r in results:
            canon_name = r[0]
            merchant_name = r[1]
            total_spent = float(r[2] or 0)
            transaction_count = int(r[3] or 0)
            avg_tx = total_spent / transaction_count if transaction_count > 0 else 0

            first_seen = r[4].strftime("%Y-%m-%d") if r[4] and not isinstance(r[4], str) else r[4] if r[4] else None
            last_seen = r[5].strftime("%Y-%m-%d") if r[5] and not isinstance(r[5], str) else r[5] if r[5] else None

            mom_amount = mom_percent = None
            confidence = classify_confidence(transaction_count)
            if periods and canon_name in prev_totals and confidence != "low":
                prev_spent = prev_totals[canon_name]
                mom_amount = round(total_spent - prev_spent, 2)
                mom_percent = round((mom_amount / prev_spent) * 100, 1) if prev_spent else None

            summary = MerchantInsightSummary(
                merchant_name=merchant_name,
                total_spent=total_spent,
                transaction_count=transaction_count,
                average_transaction_amount=round(avg_tx, 2),
                first_seen_at=str(first_seen) if first_seen else None,
                last_seen_at=str(last_seen) if last_seen else None,
                month_over_month_change_amount=mom_amount,
                month_over_month_change_percent=mom_percent,
                confidence=confidence,
            )
            summaries.append(summary)

        return summaries

    def calculate_merchant_detail(
        self,
        user_id: str,
        merchant_name: str,
        start_date: str | None = None,
        end_date: str | None = None,
        year: int | None = None,
        month: int | None = None,
    ) -> Optional[Dict[str, Any]]:
        date_filters = self._build_date_filters(start_date, end_date, year, month)
        
        # Monthly aggregates
        is_sqlite = "sqlite" in str(self.db.bind.url)
        if is_sqlite:
            yr_col = func.cast(func.strftime('%Y', Expense.purchased_at), Integer)
            mo_col = func.cast(func.strftime('%m', Expense.purchased_at), Integer)
        else:
            yr_col = extract('year', Expense.purchased_at)
            mo_col = extract('month', Expense.purchased_at)
            
        agg_query = (
            self.db.query(
                yr_col,
                mo_col,
                func.sum(Expense.amount),
                func.count(Expense.id)
            )
            .filter(Expense.user_email == user_id)
            .filter(Expense.group_id.is_(None))
            .filter(Expense.merchant_name == merchant_name)
            .filter(*date_filters)
            .group_by(yr_col, mo_col)
            .order_by(yr_col.asc(), mo_col.asc())
        )
        
        aggs = agg_query.all()
        if not aggs:
            return None
            
        monthly_aggregates = []
        tot_spent = 0.0
        tot_count = 0
        for r in aggs:
            amt = float(r[2] or 0)
            cnt = int(r[3] or 0)
            tot_spent += amt
            tot_count += cnt
            if r[0] and r[1]:
                monthly_aggregates.append({
                    "year": int(r[0]),
                    "month": int(r[1]),
                    "total_spent": amt,
                    "transaction_count": cnt
                })
                
        # Items bought
        items_query = (
            self.db.query(
                ExpenseItem.normalized_name,
                ExpenseItem.item_name,
                ExpenseItem.unit_price,
                ExpenseItem.quantity
            )
            .join(Expense, ExpenseItem.expense_id == Expense.id)
            .filter(Expense.user_email == user_id)
            .filter(Expense.group_id.is_(None))
            .filter(Expense.merchant_name == merchant_name)
            .filter(*date_filters)
        )

        items_map: Dict[str, Dict[str, Any]] = {}
        for row in items_query.all():
            name = row[0] or row[1] or "Unknown"
            price = float(row[2] or 0)
            qty = float(row[3] or 1)
            
            if name not in items_map:
                items_map[name] = {"item_name": name, "prices": [], "total_quantity": 0}
            items_map[name]["prices"].append(price)
            items_map[name]["total_quantity"] += qty
            
        items_bought = []
        for v in items_map.values():
            avg_p = sum(v["prices"]) / len(v["prices"]) if v["prices"] else 0
            items_bought.append({
                "item_name": v["item_name"],
                "avg_price": round(avg_p, 2),
                "purchase_count": len(v["prices"]),
                "total_quantity": v["total_quantity"]
            })
            
        items_bought.sort(key=lambda x: x["purchase_count"], reverse=True)

        # Recent transactions + biggest single transaction, within the same scope
        recent_expenses = (
            self.db.query(Expense)
            .filter(Expense.user_email == user_id, Expense.group_id.is_(None), Expense.merchant_name == merchant_name)
            .filter(*date_filters)
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
            .filter(Expense.user_email == user_id, Expense.group_id.is_(None), Expense.merchant_name == merchant_name)
            .filter(*date_filters)
            .order_by(Expense.amount.desc())
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

        # Spend share vs. all merchants in the same scope
        total_all_merchants = float(
            self.db.query(func.sum(Expense.amount))
            .filter(Expense.user_email == user_id, Expense.group_id.is_(None), Expense.merchant_name != None)
            .filter(*date_filters)
            .scalar()
            or 0
        )
        spend_share_percent = (
            round((tot_spent / total_all_merchants) * 100, 1) if total_all_merchants > 0 else None
        )
        average_transaction_amount = round(tot_spent / tot_count, 2) if tot_count else 0

        # Month-over-month change for this merchant, if a comparison period resolves
        periods = self._resolve_comparison_periods(start_date, end_date, year, month)
        mom_amount = mom_percent = None
        if periods:
            prev_totals = self._merchant_totals_for_period(user_id, periods[2], periods[3])
            if merchant_name in prev_totals:
                prev_spent = prev_totals[merchant_name]
                mom_amount = round(tot_spent - prev_spent, 2)
                mom_percent = round((mom_amount / prev_spent) * 100, 1) if prev_spent else None

        return {
            "id": f"detail_{merchant_name}",
            "merchant_name": merchant_name,
            "total_spent": round(tot_spent, 2),
            "transaction_count": tot_count,
            "monthly_aggregates": monthly_aggregates,
            "items_bought": items_bought,
            "recent_transactions": recent_transactions,
            "highest_transaction": highest_transaction,
            "average_transaction_amount": average_transaction_amount,
            "spend_share_percent": spend_share_percent,
            "month_over_month_change_amount": mom_amount,
            "month_over_month_change_percent": mom_percent,
        }

    def calculate_item_metrics(
        self,
        user_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
        year: int | None = None,
        month: int | None = None,
        limit: int = 20,
    ) -> List[ItemInsightSummary]:
        """
        Calculates insight metrics grouped by item. 
        Uses expenses that have receipt-backed line items in `expense_items`.
        """
        date_filters = self._build_date_filters(start_date, end_date, year, month)
        
        query = (
            self.db.query(
                ExpenseItem.normalized_name,
                func.sum(ExpenseItem.line_total).label("total_spent"),
                func.count(ExpenseItem.id).label("transaction_count"),
                func.sum(ExpenseItem.quantity).label("total_quantity"),
                func.min(ExpenseItem.unit_price).label("min_price"),
                func.max(ExpenseItem.unit_price).label("max_price"),
                func.avg(ExpenseItem.unit_price).label("avg_price"),
                func.min(Expense.purchased_at).label("first_seen"),
                func.max(Expense.purchased_at).label("last_seen"),
                func.count(func.distinct(Expense.merchant_name)).label("distinct_merchants"),
            )
            .join(Expense, ExpenseItem.expense_id == Expense.id)
            .filter(Expense.user_email == user_id)
            .filter(Expense.group_id.is_(None))
            .filter(ExpenseItem.normalized_name != None)
            .filter(*date_filters)
            .group_by(ExpenseItem.normalized_name)
            .order_by(func.sum(ExpenseItem.line_total).desc())
            .limit(limit)
        )

        results = query.all()

        periods = self._resolve_comparison_periods(start_date, end_date, year, month)
        prev_avg_prices = (
            self._item_totals_for_period(user_id, periods[2], periods[3]) if periods else {}
        )

        summaries = []
        for r in results:
            item_name = r[0]
            total_spent = float(r[1] or 0)
            transaction_count = int(r[2] or 0)
            total_quantity = float(r[3] or 0)
            avg_tx = total_spent / transaction_count if transaction_count > 0 else 0

            min_price = float(r[4] or 0)
            max_price = float(r[5] or 0)
            avg_price = float(r[6] or 0)
            first_seen = r[7].strftime("%Y-%m-%d") if r[7] and not isinstance(r[7], str) else r[7] if r[7] else None
            last_seen = r[8].strftime("%Y-%m-%d") if r[8] and not isinstance(r[8], str) else r[8] if r[8] else None
            distinct_merchants = int(r[9] or 0)

            confidence = classify_confidence(transaction_count, distinct_merchants)

            # For items, "month over month change" tracks the unit-price
            # movement (personal inflation) rather than total spend, since
            # that's the metric users actually care about per item. Suppressed
            # at low confidence so a single purchase can't masquerade as a
            # price trend (TS-ANL-009).
            mom_amount = mom_percent = None
            if periods and item_name in prev_avg_prices and confidence != "low":
                prev_price = prev_avg_prices[item_name]
                mom_amount = round(avg_price - prev_price, 2)
                mom_percent = round((mom_amount / prev_price) * 100, 1) if prev_price else None

            summary = ItemInsightSummary(
                item_name=item_name,
                total_spent=round(total_spent, 2),
                transaction_count=transaction_count,
                average_transaction_amount=round(avg_tx, 2),
                total_quantity_bought=round(total_quantity, 2),
                min_unit_price=round(min_price, 2),
                max_unit_price=round(max_price, 2),
                confidence=confidence,
                average_unit_price=round(avg_price, 2),
                month_over_month_change_amount=mom_amount,
                month_over_month_change_percent=mom_percent,
                first_seen_at=str(first_seen) if first_seen else None,
                last_seen_at=str(last_seen) if last_seen else None,
                distinct_merchants_count=distinct_merchants,
            )
            summaries.append(summary)

        return summaries

    def calculate_item_detail(
        self,
        user_id: str,
        item_name: str,
        start_date: str | None = None,
        end_date: str | None = None,
        year: int | None = None,
        month: int | None = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Dynamically calculates item detail metrics including price history and store comparisons.
        """
        date_filters = self._build_date_filters(start_date, end_date, year, month)
        
        # Get raw items
        item_rows = (
            self.db.query(
                ExpenseItem.unit_price,
                ExpenseItem.quantity,
                Expense.purchased_at,
                Expense.merchant_name,
                ExpenseItem.line_total
            )
            .join(Expense, ExpenseItem.expense_id == Expense.id)
            .filter(Expense.user_email == user_id)
            .filter(Expense.group_id.is_(None))
            .filter(
                (ExpenseItem.normalized_name == item_name) |
                (ExpenseItem.item_name == item_name)
            )
            .filter(*date_filters)
            .order_by(Expense.purchased_at.asc())
            .all()
        )
        
        if not item_rows:
            return None
            
        total_spent = 0.0
        total_quantity = 0.0
        purchase_count = len(item_rows)
        prices = []
        history = []
        store_map = {}
        merchants = set()
        
        for r in item_rows:
            unit_price = float(r[0] or 0)
            qty = float(r[1] or 1)
            purchased_at = r[2]
            merchant = r[3] or "Unknown"
            line_tot = float(r[4] or (unit_price * qty))
            
            total_spent += line_tot
            total_quantity += qty
            if unit_price > 0:
                prices.append(unit_price)
            
            if merchant:
                merchants.add(merchant)
                if merchant not in store_map:
                    store_map[merchant] = []
                if unit_price > 0:
                    store_map[merchant].append(unit_price)
                
            history.append({
                "date": purchased_at.isoformat() if purchased_at else None,
                "store_name": merchant,
                "unit_price": unit_price,
                "quantity": qty
            })
            
        avg_price = sum(prices) / len(prices) if prices else 0
        min_price = min(prices) if prices else 0
        max_price = max(prices) if prices else 0
        last_paid = history[-1]["unit_price"] if history else 0
        
        store_comparison = []
        for store, store_prices in store_map.items():
            if not store_prices:
                continue
            store_comparison.append({
                "store_name": store,
                "avg_price": round(sum(store_prices) / len(store_prices), 2),
                "min_price": round(min(store_prices), 2),
                "max_price": round(max(store_prices), 2),
                "purchase_count": len(store_prices)
            })

        # TS-ANL-009: don't let a "cheapest merchant" claim stand on a single
        # store — require at least 2 distinct stores before comparing prices.
        if len(store_comparison) < 2:
            store_comparison = []

        # Add summary fields so it complies with ItemInsightSummary interface + detail
        return {
            "id": f"detail_{item_name}",
            "item_name": item_name,
            "normalized_name": item_name,
            "total_spent": round(total_spent, 2),
            "total_quantity_bought": round(total_quantity, 2),
            "purchase_count": purchase_count,
            "average_unit_price": round(avg_price, 2),
            "min_unit_price": round(min_price, 2),
            "max_unit_price": round(max_price, 2),
            "last_paid_price": round(last_paid, 2),
            "distinct_merchants_count": len(merchants),
            "confidence": classify_confidence(purchase_count, len(merchants)),
            "price_history": history,
            "store_comparison": store_comparison
        }

    def build_rag_context(
        self,
        user_email: str,
        query: str,
        start_date: str | None = None,
        end_date: str | None = None,
        year: int | None = None,
        month: int | None = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Dynamically detects intent from the chat query by matching it against 
        the user's top items and merchants, and extracts the most relevant detail.
        """
        q_lower = query.lower()
        
        # 1. Check if the query specifically mentions an item
        # We fetch top items dynamically to know what the user buys
        top_items = self.calculate_item_metrics(
            user_id=user_email, start_date=start_date, end_date=end_date, year=year, month=month, limit=50
        )
        
        best_item_match = None
        for item in top_items:
            name_lower = item.item_name.lower()
            if name_lower in q_lower:
                best_item_match = item.item_name
                break
                
        if best_item_match:
            detail = self.calculate_item_detail(
                user_email, best_item_match, start_date, end_date, year, month
            )
            if detail:
                return {"type": "item_insight", "data": detail}

        # 2. Check if the query specifically mentions a merchant
        top_merchants = self.calculate_merchant_metrics(
            user_id=user_email, start_date=start_date, end_date=end_date, year=year, month=month, limit=50
        )
        
        best_merchant_match = None
        for m in top_merchants:
            m_lower = m.merchant_name.lower()
            if m_lower in q_lower:
                best_merchant_match = m.merchant_name
                break
                
        if best_merchant_match:
            detail = self.calculate_merchant_detail(
                user_email, best_merchant_match, start_date, end_date, year, month
            )
            if detail:
                return {"type": "merchant_insight", "data": detail}

        return None
        
    def _group_scope_suffix(self, user_id: str) -> str:
        """TS-GRP-134: merchant/item change insights are built from
        MerchantInsight/ItemInsight aggregates, which (per TS-GRP-123) blend
        personal spend with the user's group-expense shares. There's no cheap
        way to say *how much* of a given merchant/item's total came from a
        group without new bookkeeping, so — matching spec §9.2's "card copy
        must state scope" requirement — this appends an honest, general
        disclosure whenever the user belongs to any active group, rather than
        silently presenting a blended number as purely personal."""
        has_group = (
            self.db.query(GroupMember.id)
            .filter(GroupMember.user_email == user_id, GroupMember.status == "active")
            .first()
            is not None
        )
        return " (includes your share of group expenses)" if has_group else ""

    def calculate_change_insights(
        self,
        user_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
        year: int | None = None,
        month: int | None = None,
    ) -> List[ChangeInsight]:
        """
        Calculates differences between the requested period and the preceding period
        to produce "what changed" insight cards.
        """
        # Determine current and previous periods (always resolved: change
        # insights need a comparison window even if the caller passed nothing)
        cs_str, ce_str, ps_str, pe_str = self._resolve_comparison_periods(
            start_date, end_date, year, month, default_to_current_month=True
        )

        insights = []
        
        # 1. Biggest Merchant Increase & Decrease
        curr_merchants = {m.merchant_name: m.total_spent for m in self.calculate_merchant_metrics(user_id, start_date=cs_str, end_date=ce_str, limit=100)}
        prev_merchants = {m.merchant_name: m.total_spent for m in self.calculate_merchant_metrics(user_id, start_date=ps_str, end_date=pe_str, limit=100)}
        
        merchant_diffs = []
        for m, curr_spent in curr_merchants.items():
            prev_spent = prev_merchants.get(m, 0)
            diff = curr_spent - prev_spent
            if abs(diff) > 10:  # Only care about > $10 changes
                merchant_diffs.append((m, curr_spent, prev_spent, diff))
                
        # Handle new merchants
        for m, curr_spent in curr_merchants.items():
            if m not in prev_merchants and curr_spent > 50:
                insights.append(ChangeInsight(
                    metric_name="New Merchant Detected",
                    previous_value=0,
                    current_value=curr_spent,
                    change_amount=curr_spent,
                    change_percent=100,
                    time_scope="merchant",
                    entity_name=m,
                ))
                break # Only show one new merchant to avoid noise
                
        merchant_diffs.sort(key=lambda x: x[3], reverse=True)
        group_suffix = self._group_scope_suffix(user_id)
        if merchant_diffs:
            # Biggest Increase
            biggest_inc = merchant_diffs[0]
            if biggest_inc[3] > 0 and biggest_inc[2] > 0: # make sure it's an increase and not a new merchant which is handled above
                pct = (biggest_inc[3] / biggest_inc[2]) * 100
                insights.append(ChangeInsight(
                    metric_name=f"Spend Increased at {biggest_inc[0]}{group_suffix}",
                    previous_value=biggest_inc[2],
                    current_value=biggest_inc[1],
                    change_amount=biggest_inc[3],
                    change_percent=round(pct, 1),
                    time_scope="merchant",
                    entity_name=biggest_inc[0],
                ))

            # Biggest Decrease
            biggest_dec = merchant_diffs[-1]
            if biggest_dec[3] < 0 and biggest_dec[2] > 0:
                pct = (biggest_dec[3] / biggest_dec[2]) * 100
                insights.append(ChangeInsight(
                    metric_name=f"Spend Decreased at {biggest_dec[0]}{group_suffix}",
                    previous_value=biggest_dec[2],
                    current_value=biggest_dec[1],
                    change_amount=biggest_dec[3],
                    change_percent=round(pct, 1),
                    time_scope="merchant",
                    entity_name=biggest_dec[0],
                ))

        # 2. Biggest Category Increase
        # group_id.is_(None) guard: without it, a user's own group expenses would be
        # double-counted here at their *full* amount on top of whatever their actual
        # personal spend is (same class of bug TS-GRP-106 fixed in AnalysisService).
        curr_cat_query = self.db.query(Expense.category_id, func.sum(Expense.amount)).filter(Expense.user_email == user_id, Expense.group_id.is_(None), Expense.purchased_at >= cs_str)
        if ce_str: curr_cat_query = curr_cat_query.filter(Expense.purchased_at <= ce_str)
        curr_cats = {r[0]: float(r[1] or 0) for r in curr_cat_query.group_by(Expense.category_id).all()}

        prev_cat_query = self.db.query(Expense.category_id, func.sum(Expense.amount)).filter(Expense.user_email == user_id, Expense.group_id.is_(None), Expense.purchased_at >= ps_str)
        if pe_str: prev_cat_query = prev_cat_query.filter(Expense.purchased_at <= pe_str)
        prev_cats = {r[0]: float(r[1] or 0) for r in prev_cat_query.group_by(Expense.category_id).all()}
        
        cat_diffs = []
        for c, curr_spent in curr_cats.items():
            prev_spent = prev_cats.get(c, 0)
            diff = curr_spent - prev_spent
            if diff > 20 and prev_spent > 0:
                cat_diffs.append((c, curr_spent, prev_spent, diff))
                
        cat_diffs.sort(key=lambda x: x[3], reverse=True)
        if cat_diffs:
            biggest_cat_inc = cat_diffs[0]
            pct = (biggest_cat_inc[3] / biggest_cat_inc[2]) * 100
            insights.append(ChangeInsight(
                metric_name=f"{biggest_cat_inc[0]} Spend Increased",
                previous_value=biggest_cat_inc[2],
                current_value=biggest_cat_inc[1],
                change_amount=biggest_cat_inc[3],
                change_percent=round(pct, 1),
                time_scope="category",
                entity_name=str(biggest_cat_inc[0]),
            ))

        # 3. Item Price Increase
        curr_items = {i.item_name: i.average_unit_price for i in self.calculate_item_metrics(user_id, start_date=cs_str, end_date=ce_str, limit=100)}
        prev_items = {i.item_name: i.average_unit_price for i in self.calculate_item_metrics(user_id, start_date=ps_str, end_date=pe_str, limit=100)}
        
        item_diffs = []
        for item, curr_price in curr_items.items():
            prev_price = prev_items.get(item, 0)
            if prev_price > 0 and curr_price > prev_price:
                diff = curr_price - prev_price
                pct = (diff / prev_price) * 100
                if pct > 10: # Only care about > 10% price increases
                    item_diffs.append((item, curr_price, prev_price, diff, pct))
                    
        item_diffs.sort(key=lambda x: x[4], reverse=True)
        if item_diffs:
            biggest_item_inc = item_diffs[0]
            insights.append(ChangeInsight(
                metric_name=f"Price increase for {biggest_item_inc[0]}",
                previous_value=biggest_item_inc[2],
                current_value=biggest_item_inc[1],
                change_amount=round(biggest_item_inc[3], 2),
                change_percent=round(biggest_item_inc[4], 1),
                time_scope="item",
                entity_name=biggest_item_inc[0],
            ))

        # 4. Unusual Large Transaction — flag the current period's biggest single
        # transaction if it's a real outlier against the user's own history, not
        # just "the biggest one so far" (which would fire every period).
        baseline_query = self.db.query(func.avg(Expense.amount), func.count(Expense.id)).filter(
            Expense.user_email == user_id, Expense.group_id.is_(None), Expense.purchased_at < cs_str
        )
        baseline_avg, baseline_count = baseline_query.one()
        baseline_avg = float(baseline_avg or 0)
        baseline_count = int(baseline_count or 0)

        if baseline_count >= 5 and baseline_avg > 0:
            curr_largest_query = (
                self.db.query(Expense.amount, Expense.merchant_name, Expense.description)
                .filter(Expense.user_email == user_id, Expense.group_id.is_(None), Expense.purchased_at >= cs_str)
            )
            if ce_str:
                curr_largest_query = curr_largest_query.filter(Expense.purchased_at <= ce_str)
            largest = curr_largest_query.order_by(Expense.amount.desc()).first()

            if largest:
                largest_amount = float(largest[0] or 0)
                if largest_amount >= max(baseline_avg * 3, 100):
                    label = largest[1] or largest[2] or "a transaction"
                    pct = (largest_amount / baseline_avg - 1) * 100
                    insights.append(ChangeInsight(
                        metric_name=f"Unusually large transaction at {label}",
                        previous_value=round(baseline_avg, 2),
                        current_value=round(largest_amount, 2),
                        change_amount=round(largest_amount - baseline_avg, 2),
                        change_percent=round(pct, 1),
                        time_scope="transaction",
                        entity_name=largest[1] or largest[2],
                    ))

        # 5. Recurring Bill Increase — compare each active recurring template's
        # actual spend this period against last period, keyed by description
        # (the field recurring_service.py stamps onto the created Expense row).
        # Personal-only: a group recurring template's bill lives on a group expense
        # (group_id set) and belongs in that group's own change insights, not here.
        active_templates = (
            self.db.query(RecurringTemplate)
            .filter(
                RecurringTemplate.user_email == user_id,
                RecurringTemplate.status == "Active",
                RecurringTemplate.group_id.is_(None),
            )
            .all()
        )

        recurring_diffs = []
        for tpl in active_templates:
            curr_tpl_query = self.db.query(func.sum(Expense.amount)).filter(
                Expense.user_email == user_id,
                Expense.group_id.is_(None),
                Expense.description == tpl.description,
                Expense.purchased_at >= cs_str,
            )
            if ce_str:
                curr_tpl_query = curr_tpl_query.filter(Expense.purchased_at <= ce_str)
            curr_amount = float(curr_tpl_query.scalar() or 0)

            prev_tpl_query = self.db.query(func.sum(Expense.amount)).filter(
                Expense.user_email == user_id,
                Expense.group_id.is_(None),
                Expense.description == tpl.description,
                Expense.purchased_at >= ps_str,
            )
            if pe_str:
                prev_tpl_query = prev_tpl_query.filter(Expense.purchased_at <= pe_str)
            prev_amount = float(prev_tpl_query.scalar() or 0)

            if prev_amount > 0 and curr_amount > prev_amount:
                diff = curr_amount - prev_amount
                pct = (diff / prev_amount) * 100
                if diff > 3 and pct > 5:
                    recurring_diffs.append((tpl.description, curr_amount, prev_amount, diff, pct))

        recurring_diffs.sort(key=lambda x: x[4], reverse=True)
        if recurring_diffs:
            biggest_recurring = recurring_diffs[0]
            insights.append(ChangeInsight(
                metric_name=f"{biggest_recurring[0]} bill increased",
                previous_value=round(biggest_recurring[2], 2),
                current_value=round(biggest_recurring[1], 2),
                change_amount=round(biggest_recurring[3], 2),
                change_percent=round(biggest_recurring[4], 1),
                time_scope="recurring",
                entity_name=biggest_recurring[0],
            ))

        # Rank by relative magnitude so the most eye-catching change wins one
        # of the 3-5 card slots, regardless of which type produced it.
        insights.sort(key=lambda i: abs(i.change_percent), reverse=True)
        return insights[:5]
