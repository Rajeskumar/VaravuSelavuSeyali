from datetime import date
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, conint

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str

class ExpenseRequest(BaseModel):
    user_id: str
    cost: float
    category: str
    date: date
    description: str = ""

class ChatRequest(BaseModel):
    """
    Payload for the `/analysis/chat` endpoint.

    * `user_id` – the identifier of the user making the request.
    * `query`   – the user’s chat question.
    * `year`    – optional year filter for the analysis.
    * `month`   – optional month filter for the analysis.
    * `start_date` and `end_date` – optional ISO date range filters.
    """
    user_id: str
    query: str
    year: int | None = None
    month: int | None = None
    start_date: str | None = None
    end_date: str | None = None


# ---------------------- Response Models ---------------------- #

class HealthResponse(BaseModel):
    status: str = "healthy"


class DashboardResponse(BaseModel):
    total_expenses: float
    total_categories: int
    months_tracked: int


class Expense(BaseModel):
    user_id: str
    date: date
    description: str
    category: str
    cost: float


class ExpenseCreatedResponse(BaseModel):
    success: bool
    expense: Expense


class CategoryTotal(BaseModel):
    category: str
    total: float


class MonthlyTrendPoint(BaseModel):
    month: str  # YYYY-MM
    total: float


class ExpenseDetail(BaseModel):
    date: str
    description: str
    category: str
    cost: float


class AnalysisFilterInfo(BaseModel):
    applied_user_col: Optional[str]
    year: Optional[int]
    month: Optional[int]
    row_count: int


class AnalysisResponse(BaseModel):
    top_categories: List[str]
    category_totals: List[CategoryTotal]
    monthly_trend: List[MonthlyTrendPoint]
    total_expenses: float
    category_expense_details: Dict[str, List[ExpenseDetail]]
    filter_info: AnalysisFilterInfo


class ChatResponse(BaseModel):
    response: str


class ErrorResponse(BaseModel):
    code: str = Field(default="error")
    message: str
    details: Optional[Dict[str, Any]] = None

