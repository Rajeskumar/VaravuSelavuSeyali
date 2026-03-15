import sys
import os

# Add the app directory to PYTHONPATH so imports work
sys.path.append(os.path.join(os.path.dirname(__file__), 'varavu_selavu_app'))

from fastapi.testclient import TestClient
from varavu_selavu_service.main import app
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.session import SessionLocal
from varavu_selavu_service.db.models import Expense
from varavu_selavu_service.services.insights_aggregation_service import InsightsAggregationService

def backfill_merchants():
    db = SessionLocal()
    agg_svc = InsightsAggregationService(db)
    
    print("Querying for expenses without a merchant_name...")
    # Fetch all expenses where merchant_name is null or empty
    expenses = db.query(Expense).filter(
        (Expense.merchant_name == None) | (Expense.merchant_name == "")
    ).all()
    
    print(f"Found {len(expenses)} expenses to backfill.")
    
    count = 0
    updated_expense_id = []
    for exp in expenses:
        if not exp.description:
            continue
            
        print(f"Processing document [{exp.id}]: {exp.description}")
        
        # Override the auth dependency dynamically per user
        app.dependency_overrides[auth_required] = lambda: exp.user_email
        client = TestClient(app)
        
        # Check hardcoded rules first
        desc_lower = exp.description.lower().strip()
        merchant = None
        
        if "tnc" in desc_lower:
            merchant = "TNC"
        elif "car insurance" == desc_lower:
            merchant = "Tesla"
        elif "ny gyro" in desc_lower:
            merchant = "NewYork Gyro"

            
        if not merchant:
            # 1. Call the categorization api to generate the merchant name
            cat_res = client.post("/api/v1/expenses/categorize", json={"description": exp.description})
            if cat_res.status_code != 200:
                print(f" Failed categorization API: {cat_res.text}")
                continue
                
            merchant = cat_res.json().get("merchant_name")
            if merchant:
                print(f" -> Generated merchant: {merchant}")
                
        if merchant:
            
            # 2. Call the update expense api to save it
            update_payload = {
                "user_id": exp.user_email,
                "cost": float(exp.amount),
                "category": exp.category_id,
                "description": exp.description,
                "date": exp.purchased_at.strftime("%m/%d/%Y"),
                "merchant_name": merchant
            }
            
            update_res = client.put(f"/api/v1/expenses/{str(exp.id)}", json=update_payload)
            if update_res.status_code == 200:
                print(f" -> Successfully updated via API")
                updated_expense_id.append(exp.id)
                # Also manual aggregation because `update_expense` API currently bypasses it
                try:
                    agg_svc.on_simple_expense_created(
                        user_email=exp.user_email,
                        merchant_name=merchant,
                        purchased_at=exp.purchased_at,
                        amount=float(exp.amount),
                    )
                    count += 1
                except Exception as exc:
                    print(f" -> Aggregation failed: {exc}")
            else:
                print(f" -> Failed updating expense API: {update_res.text}")
                
    db.close()
    print(f"Updated expense_id : {updated_expense_id}")
    print(f"Successfully backfilled {count} merchant names via the API.")

if __name__ == "__main__":
    backfill_merchants()
