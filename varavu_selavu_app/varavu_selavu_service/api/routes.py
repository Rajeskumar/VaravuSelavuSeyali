from fastapi import APIRouter, Request, HTTPException

from varavu_selavu_service.models.api_models import LoginRequest, ExpenseRequest

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "healthy"}

@router.post("/login")
def login(data: LoginRequest):
    # Dummy authentication logic
    if data.email == "user@example.com" and data.password == "password":
        return {"success": True, "token": "dummy-token"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@router.post("/add-expense")
def add_expense(data: ExpenseRequest):
    # Dummy add expense logic
    return {"success": True, "expense": data.dict()}

@router.get("/dashboard")
def dashboard():
    # Dummy dashboard data
    return {
        "total_expenses": 1234.56,
        "total_categories": 12,
        "months_tracked": 5
    }

@router.get("/analysis")
def analysis():
    # Dummy analysis data
    return {
        "top_categories": ["Food", "Transport", "Utilities"],
        "monthly_trend": [100, 200, 150, 300, 250]
    }
