import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'varavu_selavu_app'))

from varavu_selavu_service.db.session import SessionLocal
from varavu_selavu_service.db.models import Expense, ExpenseItem, ItemInsight, ItemPriceHistory, MerchantInsight, MerchantAggregate
from varavu_selavu_service.services.insights_aggregation_service import InsightsAggregationService
from collections import defaultdict

def backfill_insights():
    """
    Idempotent script to backfill insights based on existing Expense and ExpenseItem data.
    It first clears existing insights to avoid double counting, then replays
    aggregation for each expense.
    """
    db = SessionLocal()
    agg_svc = InsightsAggregationService(db)
    
    print("Clearing existing insights data for idempotency...")
    db.query(ItemPriceHistory).delete()
    db.query(ItemInsight).delete()
    db.query(MerchantAggregate).delete()
    db.query(MerchantInsight).delete()
    db.commit()
    print("Cleared.")
    
    # 1. Backfill Simple Expenses (Merchant Insights)
    print("Fetching expenses...")
    expenses = db.query(Expense).all()
    print(f"Found {len(expenses)} expenses to process.")
    
    # Pre-fetch items to avoid N+1 queries during mapping
    print("Fetching items...")
    items = db.query(ExpenseItem).all()
    expense_to_items = defaultdict(list)
    for item in items:
        # We need it as a dict to match the Service's expected signature
        expense_to_items[item.expense_id].append({
            "normalized_name": item.normalized_name or item.item_name,
            "unit_price": float(item.unit_price or 0),
            "quantity": float(item.quantity or 1),
            "line_total": float(item.line_total or 0)
        })
    print(f"Found {len(items)} items mapped to expenses.")

    processed_merchants = 0
    processed_items_events = 0

    print("Running aggregation pipeline...")
    for exp in expenses:
        exp_items = expense_to_items.get(exp.id, [])
        
        if len(exp_items) > 0:
            # Replay with items
            agg_svc.on_expense_with_items_created(
                user_email=exp.user_email,
                expense_id=str(exp.id),
                merchant_name=exp.merchant_name,
                purchased_at=exp.purchased_at,
                items=exp_items,
                total_amount=float(exp.amount)
            )
            processed_items_events += 1
        else:
            # Replay without items (simple expense)
            if exp.merchant_name:
                agg_svc.on_simple_expense_created(
                    user_email=exp.user_email,
                    merchant_name=exp.merchant_name,
                    purchased_at=exp.purchased_at,
                    amount=float(exp.amount)
                )
                processed_merchants += 1

    db.commit()
    print("-" * 50)
    print("Backfill Complete!")
    print(f"Processed {processed_merchants} simple expenses (merchants).")
    print(f"Processed {processed_items_events} itemized expenses (merchants + items).")
    
    print("-" * 50)
    print("Running Analytics Validation...")
    run_validation(db)
    
    db.close()


def run_validation(db):
    """
    Validates that the aggregated insight totals match the raw source totals.
    """
    from sqlalchemy import func
    
    # 1. Validate Merchant Insights
    print("Validating Merchant Insights...")
    # Raw source: sum of non-null merchant expenses
    raw_merchant_sum = db.query(func.sum(Expense.amount)).filter(Expense.merchant_name != None).scalar() or 0
    # Aggregated: sum of merchant insights
    agg_merchant_sum = db.query(func.sum(MerchantInsight.total_spent)).scalar() or 0
    
    raw_m_val = float(raw_merchant_sum)
    agg_m_val = float(agg_merchant_sum)
    diff_m = abs(raw_m_val - agg_m_val)
    
    print(f"  Source Total: ${raw_m_val:,.2f}")
    print(f"  Agg    Total: ${agg_m_val:,.2f}")
    if diff_m < 0.05:
        print("  ✅ Merchant totals match perfectly.")
    else:
        print(f"  ❌ Merchant mismatch detected. Diff: ${diff_m:,.2f}")
        
    # 2. Validate Item Insights
    print("\nValidating Item Insights...")
    # Raw source: sum of line_total for items with normalized/item names
    raw_item_sum = db.query(func.sum(ExpenseItem.line_total)).filter(
        (ExpenseItem.normalized_name != None) | (ExpenseItem.item_name != None)
    ).scalar() or 0
    # Aggregated: sum of item insights
    agg_item_sum = db.query(func.sum(ItemInsight.total_spent)).scalar() or 0
    
    raw_i_val = float(raw_item_sum)
    agg_i_val = float(agg_item_sum)
    diff_i = abs(raw_i_val - agg_i_val)
    
    print(f"  Source Total: ${raw_i_val:,.2f}")
    print(f"  Agg    Total: ${agg_i_val:,.2f}")
    if diff_i < 0.05:
        print("  ✅ Item totals match perfectly.")
    else:
        print(f"  ❌ Item mismatch detected. Diff: ${diff_i:,.2f}")

if __name__ == "__main__":
    backfill_insights()
