from fastapi import APIRouter, Request, HTTPException, Response

from varavu_selavu_service.models.api_models import (
    LoginRequest,
    ExpenseRequest,
    LoginResponse,
    ChatRequest,
)
from varavu_selavu_service.services.auth_service import AuthService
from varavu_selavu_service.services.expense_service import ExpenseService
from varavu_selavu_service.services.chat_service import call_chat_model
import pandas as pd
import time
from threading import RLock

router = APIRouter()

# Simple in-memory cache for analysis results
_ANALYSIS_CACHE: dict[tuple[str, int | None, int | None], tuple[float, dict]] = {}
_ANALYSIS_CACHE_TTL_SEC = 60  # adjust as needed
_CACHE_LOCK = RLock()

@router.get("/health")
def health_check():
    return {"status": "healthy"}

@router.post("/login")
def login(data: LoginRequest) -> LoginResponse:
    auth = AuthService()
    ok = auth.login(email=data.username, password=data.password)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # For now, return a static token structure expected by frontend
    return LoginResponse(access_token="access-token", token_type="bearer")

@router.post("/add-expense")
def add_expense(data: ExpenseRequest):
    svc = ExpenseService()
    saved = svc.add_expense(
        user_id=data.user_id,
        date=data.date,
        description=data.description,
        category=data.category,
        cost=data.cost,
    )
    # Invalidate analysis cache on writes
    with _CACHE_LOCK:
        _ANALYSIS_CACHE.clear()
    return {"success": True, "expense": saved}

@router.get("/dashboard")
def dashboard():
    # Dummy dashboard data
    return {
        "total_expenses": 1234.56,
        "total_categories": 12,
        "months_tracked": 5
    }

@router.get("/analysis")
def analysis(user_id: str, year: int | None = None, month: int | None = None, response: Response = None):
    """Return simple analysis for a given user from Google Sheets."""
    # Serve from cache if fresh
    cache_key = (user_id, int(year) if year is not None else None, int(month) if month is not None else None)
    now_ts = time.time()
    with _CACHE_LOCK:
        entry = _ANALYSIS_CACHE.get(cache_key)
        if entry and (now_ts - entry[0] < _ANALYSIS_CACHE_TTL_SEC):
            if response is not None:
                response.headers["Cache-Control"] = f"public, max-age={_ANALYSIS_CACHE_TTL_SEC}"
            return entry[1]
    svc = ExpenseService()
    df = svc.load_dataframe()
    if df.empty:
        return {"top_categories": [], "monthly_trend": []}

    # Normalize column names to snake_case lower for robustness
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]

    # Filter by user id/email across likely columns
    applied_user_filter = None
    candidate_user_cols = [c for c in df.columns if ("user" in c or "email" in c)]
    for col in ["user_id", "email", "user"] + candidate_user_cols:
        if col in df.columns:
            tmp = df[df[col] == user_id]
            if not tmp.empty:
                df = tmp
                applied_user_filter = col
                break

    # Ensure expected columns exist with correct types
    # Detect a date-like column fallback if 'date' is absent
    date_col = "date" if "date" in df.columns else None
    if date_col is None:
        for c in df.columns:
            if "date" in c:  # e.g., transaction_date, created_at_date
                date_col = c
                break
    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        # If many dates failed to parse, try again with dayfirst to support DD/MM/YYYY inputs
        if df[date_col].isna().mean() > 0.5:
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce", dayfirst=True)
    if "cost" in df.columns:
        df["cost"] = pd.to_numeric(df["cost"], errors="coerce")
    # Drop rows missing required analysis fields
    required_cols = [c for c in [date_col, "cost"] if c]
    if required_cols:
        df = df.dropna(subset=required_cols)

    # Optional filters by year/month (only if date available)
    if date_col:
        if year is not None:
            df = df[df[date_col].dt.year == int(year)]
        if month is not None:
            df = df[df[date_col].dt.month == int(month)]

    # Top categories by spend and category totals
    category_totals = []
    if "category" in df.columns:
        cat = df.groupby("category")["cost"].sum().sort_values(ascending=False)
        top_categories = cat.index.tolist()[:5]
        category_totals = [{"category": k, "total": float(v)} for k, v in cat.items()]
    else:
        top_categories = []

    # Monthly trend (sum per month within available data)
    monthly_trend = []
    if date_col:
        trend = (
            df.assign(YearMonth=df[date_col].dt.to_period("M").dt.to_timestamp())
            .groupby("YearMonth")["cost"].sum().reset_index()
        )
        monthly_trend = [{"month": r["YearMonth"].strftime("%Y-%m"), "total": float(r["cost"])} for _, r in trend.iterrows()]

    total_expenses = float(df["cost"].sum()) if "cost" in df.columns else 0.0

    # If a specific month is selected, return expense details per category for hover UI
    category_expense_details = {}
    if month is not None:
        if "category" in df.columns:
            for cat_name, g in df.groupby("category"):
                details = [
                    {
                        "date": (r[date_col].strftime("%Y-%m-%d") if date_col and (date_col in r) and not pd.isna(r[date_col]) else ""),
                        "description": str(r.get("description", "")),
                        "category": str(r.get("category", "")),
                        "cost": float(r.get("cost", 0) or 0),
                    }
                    for _, r in g.iterrows()
                ]
                category_expense_details[cat_name] = details

    result = {
        "top_categories": top_categories,
        "category_totals": category_totals,
        "monthly_trend": monthly_trend,
        "total_expenses": total_expenses,
        "category_expense_details": category_expense_details,
        "filter_info": {
            "applied_user_col": applied_user_filter,
            "year": int(year) if year is not None else None,
            "month": int(month) if month is not None else None,
            "row_count": int(len(df)),
        },
    }

    # Store in cache
    with _CACHE_LOCK:
        _ANALYSIS_CACHE[cache_key] = (now_ts, result)
    if response is not None:
        response.headers["Cache-Control"] = f"public, max-age={_ANALYSIS_CACHE_TTL_SEC}"
    return result


@router.post("/analysis/chat")
def analysis_chat(request: ChatRequest, response: Response = None):
    """
    Accepts a chat query and returns a response generated by the chat model.
    In production the OpenAI API is used, while locally a running Ollama instance
    provides the responses. The query is sent together with the analysis data
    for the requested month (if any).

    The request body is validated by the `ChatRequest` Pydantic model.
    """
    # Re‑use the existing analysis logic to get the data for the requested month
    analysis_result = analysis(
        user_id=request.user_id,
        year=request.year,
        month=request.month,
        response=None,  # we do not want to touch the cache
    )

    # Pass the query + analysis to the appropriate chat model
    chat_response = call_chat_model(query=request.query, analysis=analysis_result)

    return {"response": chat_response}

