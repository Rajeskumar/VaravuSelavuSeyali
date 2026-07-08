import sys
import os
import uuid
from collections import defaultdict
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), 'varavu_selavu_app'))

from varavu_selavu_service.db.session import SessionLocal
from varavu_selavu_service.db.models import (
    Expense, ExpenseItem, ItemInsight, ItemPriceHistory,
    MerchantInsight, MerchantAggregate, ExpenseSplit, GroupMember, ExpenseItemSplit
)

def backfill_insights():
    db = SessionLocal()
    
    print("Clearing existing insights data for idempotency...")
    db.query(ItemPriceHistory).delete()
    db.query(ItemInsight).delete()
    db.query(MerchantAggregate).delete()
    db.query(MerchantInsight).delete()
    db.commit()
    print("Cleared.")
    
    print("Fetching data...")
    expenses = db.query(Expense).all()
    expense_items = db.query(ExpenseItem).all()
    expense_splits = db.query(ExpenseSplit).all()
    expense_item_splits = db.query(ExpenseItemSplit).all()
    group_members = db.query(GroupMember).all()
    
    member_email_map = {m.id: m.user_email for m in group_members}
    
    item_map = defaultdict(list)
    for i in expense_items:
        item_map[i.expense_id].append(i)
        
    split_map = defaultdict(list)
    for s in expense_splits:
        split_map[s.expense_id].append(s)
        
    item_split_map = defaultdict(list)
    for s in expense_item_splits:
        item_split_map[s.expense_item_id].append(s)

    m_insights = {}
    m_aggs = {}
    i_insights = {}
    i_histories = []

    def add_merchant(email, name, amount, dt):
        if not name or not email:
            return
        key = (email, name)
        if key not in m_insights:
            m_insights[key] = {"id": uuid.uuid4(), "total": 0.0, "count": 0}
        m_insights[key]["total"] += amount
        m_insights[key]["count"] += 1
        
        agg_key = (email, name, dt.year, dt.month)
        if agg_key not in m_aggs:
            m_aggs[agg_key] = {"id": uuid.uuid4(), "total": 0.0, "count": 0}
        m_aggs[agg_key]["total"] += amount
        m_aggs[agg_key]["count"] += 1
        
    def add_item(email, name, amount, qty, price, expense_id, store_name, dt):
        if not name or not email:
            return
        key = (email, name)
        if key not in i_insights:
            i_insights[key] = {"id": uuid.uuid4(), "total": 0.0, "qty": 0.0, "min_p": None, "max_p": None, "prices": []}
        i_insights[key]["total"] += amount
        i_insights[key]["qty"] += qty
        i_insights[key]["prices"].append(price)
        
        if i_insights[key]["min_p"] is None or price < i_insights[key]["min_p"]:
            i_insights[key]["min_p"] = price
        if i_insights[key]["max_p"] is None or price > i_insights[key]["max_p"]:
            i_insights[key]["max_p"] = price
        
        i_histories.append({
            "id": uuid.uuid4(),
            "item_insight_id": i_insights[key]["id"],
            "expense_id": expense_id,
            "store_name": store_name,
            "unit_price": price,
            "quantity": qty,
            "date": dt
        })

    for exp in expenses:
        dt = exp.purchased_at or datetime.utcnow()
        items = item_map[exp.id]
        
        if exp.group_id is not None:
            if len(items) > 0:
                for item in items:
                    splits = item_split_map[item.id]
                    for s in splits:
                        email = member_email_map.get(s.member_id)
                        if email:
                            iname = item.normalized_name or item.item_name
                            price = float(item.unit_price or item.line_total)
                            qty = float(item.quantity or 1) * float(s.ratio)
                            amt = float(s.amount)
                            add_item(email, iname, amt, qty, price, exp.id, exp.merchant_name, dt)
                            if exp.merchant_name:
                                add_merchant(email, exp.merchant_name, amt, dt)
            else:
                splits = split_map[exp.id]
                for s in splits:
                    email = member_email_map.get(s.member_id)
                    if email and exp.merchant_name:
                        add_merchant(email, exp.merchant_name, float(s.amount_owed), dt)
        else:
            if len(items) > 0:
                for item in items:
                    iname = item.normalized_name or item.item_name
                    price = float(item.unit_price or item.line_total)
                    qty = float(item.quantity or 1)
                    amt = float(item.line_total)
                    add_item(exp.user_email, iname, amt, qty, price, exp.id, exp.merchant_name, dt)
                if exp.merchant_name:
                    add_merchant(exp.user_email, exp.merchant_name, float(exp.amount), dt)
            else:
                if exp.merchant_name:
                    add_merchant(exp.user_email, exp.merchant_name, float(exp.amount), dt)

    print("Inserting data...")
    for (email, name), data in m_insights.items():
        db.add(MerchantInsight(id=data["id"], user_email=email, merchant_name=name, total_spent=data["total"], transaction_count=data["count"]))
    db.flush()
        
    for (email, name, y, m), data in m_aggs.items():
        mid = m_insights[(email, name)]["id"]
        db.add(MerchantAggregate(id=data["id"], merchant_insight_id=mid, year=y, month=m, total_spent=data["total"], transaction_count=data["count"]))
    db.flush()

    for (email, name), data in i_insights.items():
        avg = sum(data["prices"]) / len(data["prices"]) if data["prices"] else 0
        db.add(ItemInsight(
            id=data["id"], 
            user_email=email, 
            normalized_name=name, 
            total_spent=data["total"], 
            total_quantity_bought=data["qty"],
            min_price=data["min_p"],
            max_price=data["max_p"],
            avg_unit_price=avg
        ))
    db.flush()
        
    for h in i_histories:
        db.add(ItemPriceHistory(**h))
    db.flush()

    db.commit()
    print("Backfill Complete!")
    db.close()

if __name__ == "__main__":
    backfill_insights()

def run_validation(db):
    from sqlalchemy import func
    print("Validating Merchant Insights...")
    raw_merchant_sum = db.query(func.sum(Expense.amount)).filter(Expense.merchant_name != None).scalar() or 0
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

    print("\nValidating Item Insights...")
    raw_item_sum = db.query(func.sum(ExpenseItem.line_total)).filter(
        (ExpenseItem.normalized_name != None) | (ExpenseItem.item_name != None)
    ).scalar() or 0
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

