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
    date: str = Field(pattern=r"\d{2}/\d{2}/\d{4}")
    description: str = ""


class ReceiptParseResponse(BaseModel):
    header: Dict[str, Any]
    items: List[Dict[str, Any]]
    warnings: List[str]
    fingerprint: str
    ocr_text: str | None = None


class ExpenseItem(BaseModel):
    line_no: int
    item_name: str
    normalized_name: str | None = None
    category_id: str | None = None
    quantity: float | None = None
    unit: str | None = None
    unit_price: float | None = None
    line_total: float
    tax: float | None = 0
    discount: float | None = 0
    attributes_json: str | None = None


class ExpenseWithItemsRequest(BaseModel):
    user_email: str
    header: Dict[str, Any]
    items: List[ExpenseItem]


class ExpenseWithItemsResponse(BaseModel):
    expense_id: str
    item_ids: List[str]


class CategorizeRequest(BaseModel):
    """Request payload for expense categorization."""
    description: str


class CategorizeResponse(BaseModel):
    """Response with suggested main category and subcategory."""
    main_category: str
    subcategory: str


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
    model: Optional[str] = None


# ---------------------- Response Models ---------------------- #

class HealthResponse(BaseModel):
    status: str = "healthy"


class DashboardResponse(BaseModel):
    total_expenses: float
    total_categories: int
    months_tracked: int


class Expense(BaseModel):
    user_id: str
    date: str = Field(pattern=r"\d{2}/\d{2}/\d{4}")
    description: str
    category: str
    cost: float


class ExpenseRow(Expense):
    row_id: int


class ExpenseCreatedResponse(BaseModel):
    success: bool
    expense: Expense


class ExpenseDeleteResponse(BaseModel):
    """Simple success flag for deletions."""
    success: bool

class ExpenseListResponse(BaseModel):
    """Paginated list of expenses."""
    items: List[ExpenseRow]
    next_offset: int | None = None


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


class ModelListResponse(BaseModel):
    provider: str
    models: List[str]


# ---------------------- Recurring ---------------------- #

class RecurringTemplateDTO(BaseModel):
    id: str
    description: str
    category: str
    day_of_month: conint(ge=1, le=31)  # type: ignore
    default_cost: float
    start_date_iso: str
    last_processed_iso: str | None = None
    status: str = "active"


class UpsertRecurringTemplateRequest(BaseModel):
    description: str
    category: str
    day_of_month: conint(ge=1, le=31)  # type: ignore
    default_cost: float
    start_date_iso: str | None = None
    status: str = "active"


class DueOccurrenceDTO(BaseModel):
    template_id: str
    date_iso: str
    description: str
    category: str
    suggested_cost: float


class ConfirmRecurringRequest(BaseModel):
    items: List[Dict[str, str | float]]
