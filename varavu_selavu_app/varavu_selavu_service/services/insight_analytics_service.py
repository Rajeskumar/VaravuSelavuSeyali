from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, Integer
import time
from threading import RLock

from varavu_selavu_service.db.models import Expense, ExpenseItem
from varavu_selavu_service.models.api_models import InsightMetrics, MerchantInsightSummary, ItemInsightSummary, ChangeInsight

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
        
        # We need sum(amount) and count(*) by merchant
        query = (
            self.db.query(
                Expense.merchant_name,
                func.sum(Expense.amount).label("total_spent"),
                func.count(Expense.id).label("transaction_count"),
                func.min(Expense.purchased_at).label("first_seen"),
                func.max(Expense.purchased_at).label("last_seen"),
            )
            .filter(Expense.user_email == user_id)
            .filter(Expense.merchant_name != None)
            .filter(*date_filters)
            .group_by(Expense.merchant_name)
            .order_by(func.sum(Expense.amount).desc())
            .limit(limit)
        )

        results = query.all()
        summaries = []
        for r in results:
            merchant_name = r[0]
            total_spent = float(r[1] or 0)
            transaction_count = int(r[2] or 0)
            avg_tx = total_spent / transaction_count if transaction_count > 0 else 0
            
            first_seen = r[3].strftime("%Y-%m-%d") if r[3] and not isinstance(r[3], str) else r[3] if r[3] else None
            last_seen = r[4].strftime("%Y-%m-%d") if r[4] and not isinstance(r[4], str) else r[4] if r[4] else None
            
            summary = MerchantInsightSummary(
                merchant_name=merchant_name,
                total_spent=total_spent,
                transaction_count=transaction_count,
                average_transaction_amount=round(avg_tx, 2),
                first_seen_at=str(first_seen) if first_seen else None,
                last_seen_at=str(last_seen) if last_seen else None,
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

        return {
            "id": f"detail_{merchant_name}",
            "merchant_name": merchant_name,
            "total_spent": round(tot_spent, 2),
            "transaction_count": tot_count,
            "monthly_aggregates": monthly_aggregates,
            "items_bought": items_bought
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
            )
            .join(Expense, ExpenseItem.expense_id == Expense.id)
            .filter(Expense.user_email == user_id)
            .filter(ExpenseItem.normalized_name != None)
            .filter(*date_filters)
            .group_by(ExpenseItem.normalized_name)
            .order_by(func.sum(ExpenseItem.line_total).desc())
            .limit(limit)
        )

        results = query.all()
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

            summary = ItemInsightSummary(
                item_name=item_name,
                total_spent=round(total_spent, 2),
                transaction_count=transaction_count,
                average_transaction_amount=round(avg_tx, 2),
                total_quantity_bought=round(total_quantity, 2),
                min_unit_price=round(min_price, 2),
                max_unit_price=round(max_price, 2),
                average_unit_price=round(avg_price, 2),
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
        # Determine current and previous periods
        curr_start = None
        curr_end = None
        prev_start = None
        prev_end = None
        
        if year is not None and month is not None:
            # Month over month
            curr_start = date(year, month, 1)
            # Find next month to get end date
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
            # Year over year
            curr_start = date(year, 1, 1)
            curr_end = date(year, 12, 31)
            prev_start = date(year - 1, 1, 1)
            prev_end = date(year - 1, 12, 31)
        elif start_date and end_date:
            # Custom range
            curr_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            curr_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            delta = curr_end - curr_start
            prev_end = curr_start - timedelta(days=1)
            prev_start = prev_end - delta
            
        if not curr_start or not prev_start:
            # Default to current month vs previous month if no valid filters provided
            today = date.today()
            curr_start = date(today.year, today.month, 1)
            if today.month == 1:
                prev_start = date(today.year - 1, 12, 1)
            else:
                prev_start = date(today.year, today.month - 1, 1)
            prev_end = curr_start - timedelta(days=1)
            
        # Helper to convert to iso string for DB filtering
        cs_str = curr_start.strftime("%Y-%m-%d")
        ce_str = curr_end.strftime("%Y-%m-%d") if curr_end else None
        ps_str = prev_start.strftime("%Y-%m-%d")
        pe_str = prev_end.strftime("%Y-%m-%d") if prev_end else None
        
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
        if merchant_diffs:
            # Biggest Increase
            biggest_inc = merchant_diffs[0]
            if biggest_inc[3] > 0 and biggest_inc[2] > 0: # make sure it's an increase and not a new merchant which is handled above
                pct = (biggest_inc[3] / biggest_inc[2]) * 100
                insights.append(ChangeInsight(
                    metric_name=f"Spend Increased at {biggest_inc[0]}",
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
                    metric_name=f"Spend Decreased at {biggest_dec[0]}",
                    previous_value=biggest_dec[2],
                    current_value=biggest_dec[1],
                    change_amount=biggest_dec[3],
                    change_percent=round(pct, 1),
                    time_scope="merchant",
                    entity_name=biggest_dec[0],
                ))

        # 2. Biggest Category Increase
        curr_cat_query = self.db.query(Expense.category_id, func.sum(Expense.amount)).filter(Expense.user_email == user_id, Expense.purchased_at >= cs_str)
        if ce_str: curr_cat_query = curr_cat_query.filter(Expense.purchased_at <= ce_str)
        curr_cats = {r[0]: float(r[1] or 0) for r in curr_cat_query.group_by(Expense.category_id).all()}
        
        prev_cat_query = self.db.query(Expense.category_id, func.sum(Expense.amount)).filter(Expense.user_email == user_id, Expense.purchased_at >= ps_str)
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

        return insights[:5] # Return top 5 most interesting insights
