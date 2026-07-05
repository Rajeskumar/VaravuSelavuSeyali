from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, EmailStr, Field, conint

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
    description: str
    date: str = Field(pattern=r"\d{2}/\d{2}/\d{4}")
    merchant_name: Optional[str] = None


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
    """Response with suggested main category and subcategory (and optional merchant name)."""
    main_category: str
    subcategory: str
    merchant_name: Optional[str] = None


class ChatRequest(BaseModel):
    """
    Payload for the `/analysis/chat` endpoint.

    * `messages` - array of message history.
    * `year`/`month`/`start_date`/`end_date` - optional explicit scope for the
      "what period is this conversation about" question. Precedence matches
      every other analytics endpoint: start/end date > year/month > server
      default (rolling last 3 months). All optional so existing clients that
      don't send a scope keep working.
    """
    messages: List[Dict[str, str]] = []
    model: Optional[str] = None
    provider: Optional[str] = None
    year: Optional[int] = None
    month: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


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
    merchant_name: Optional[str] = None


class ExpenseRow(Expense):
    row_id: Union[int, str]


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
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    scope: Optional[str] = None
    group_id: Optional[str] = None


class SpendBreakdown(BaseModel):
    personal: float
    group_share: float


class AnalysisGroupSummary(BaseModel):
    group_id: str
    name: str
    my_share: float
    i_paid: float
    group_total: float
    my_balance: float


class AnalysisResponse(BaseModel):
    top_categories: List[str]
    category_totals: List[CategoryTotal]
    monthly_trend: List[MonthlyTrendPoint]
    total_expenses: float
    category_expense_details: Dict[str, List[ExpenseDetail]]
    filter_info: AnalysisFilterInfo
    scope: Optional[str] = None
    spend_breakdown: Optional[SpendBreakdown] = None
    group_summaries: Optional[List[AnalysisGroupSummary]] = None


class ChatResponse(BaseModel):
    response: str


class ErrorResponse(BaseModel):
    code: str = Field(default="error")
    message: str
    details: Optional[Dict[str, Any]] = None


class ModelOption(BaseModel):
    provider: str
    id: str
    name: str

class ModelListResponse(BaseModel):
    models: List[ModelOption]

# ---------------------- Insight Analytics ---------------------- #

class InsightMetrics(BaseModel):
    total_spent: float
    transaction_count: int
    average_transaction_amount: float
    month_over_month_change_amount: Optional[float] = None
    month_over_month_change_percent: Optional[float] = None
    average_unit_price: Optional[float] = None
    min_unit_price: Optional[float] = None
    max_unit_price: Optional[float] = None
    total_quantity_bought: Optional[float] = None
    last_paid_price: Optional[float] = None
    distinct_merchants_count: Optional[int] = None
    first_seen_at: Optional[str] = None
    last_seen_at: Optional[str] = None
    confidence: Optional[str] = None  # "high" | "medium" | "low" — see TS-ANL-009


class MerchantInsightSummary(InsightMetrics):
    merchant_name: str


class ItemInsightSummary(InsightMetrics):
    item_name: str


class ChangeInsight(BaseModel):
    metric_name: str
    previous_value: float
    current_value: float
    change_amount: float
    change_percent: float  # baseline indicated, typically vs previous month
    time_scope: str
    entity_name: Optional[str] = None


# ---------------------- Recurring ---------------------- #

class RecurringTemplateDTO(BaseModel):
    id: str
    description: str
    category: str
    merchant_name: str | None = None
    day_of_month: conint(ge=1, le=31)  # type: ignore
    default_cost: float
    start_date_iso: str
    last_processed_iso: str | None = None
    status: str = "Active"


class UpsertRecurringTemplateRequest(BaseModel):
    description: str
    category: str
    merchant_name: str | None = None
    day_of_month: conint(ge=1, le=31)  # type: ignore
    default_cost: float
    start_date_iso: str | None = None
    status: str = "Active"


class DueOccurrenceDTO(BaseModel):
    template_id: str
    date_iso: str
    description: str
    category: str
    merchant_name: str | None = None
    suggested_cost: float


class ConfirmRecurringRequest(BaseModel):
    items: List[Dict[str, str | float]]


# ---------------------- Groups (TS-GRP series) ---------------------- #

class CreateGroupRequest(BaseModel):
    name: str
    group_type: str = "other"  # trip|home|couple|other
    cover: Optional[str] = None
    currency: str = "USD"


class UpdateGroupRequest(BaseModel):
    """Phase 1 only covers name/type/cover — default_split/simplify_debts/currency are Phase 2 (spec §5.1)."""
    name: Optional[str] = None
    group_type: Optional[str] = None
    cover: Optional[str] = None


class MemberDTO(BaseModel):
    member_id: str
    display_name: str
    role: str
    status: str
    user_email: Optional[str] = None


class GroupSummary(BaseModel):
    group_id: str
    name: str
    group_type: str
    member_count: int
    my_balance: float = 0.0  # real balance computation lands with TS-GRP-104


class GroupDetailResponse(BaseModel):
    group_id: str
    name: str
    group_type: str
    cover: Optional[str] = None
    currency: str
    simplify_debts: bool
    status: str
    members: List[MemberDTO]


class AddMemberRequest(BaseModel):
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None


class CreateInviteRequest(BaseModel):
    member_id: str


class CreateInviteResponse(BaseModel):
    token: str
    url: str
    expires_at: str


class AcceptInviteRequest(BaseModel):
    token: str


class AcceptInviteResponse(BaseModel):
    group_id: str
    member_id: str
    display_name: str


class RecordSettlementRequest(BaseModel):
    from_member_id: str
    to_member_id: str
    amount: float
    method: Optional[str] = None
    settled_at: Optional[str] = None  # ISO 8601; defaults to now() when omitted
    notes: Optional[str] = None


class SettlementDTO(BaseModel):
    id: str
    group_id: str
    from_member_id: str
    to_member_id: str
    amount: float
    method: Optional[str] = None
    settled_at: str
    notes: Optional[str] = None
    created_by: Optional[str] = None


class GroupSplitEntry(BaseModel):
    member_id: str
    value: Optional[float] = None  # required for exact/percentage; unused for equal


class GroupSplitConfig(BaseModel):
    type: str  # equal|exact|percentage (Phase 1)
    entries: List[GroupSplitEntry] = []


class GroupExpensePayerEntry(BaseModel):
    member_id: str
    amount_paid: float


class GroupExpenseRequest(BaseModel):
    date: str = Field(pattern=r"\d{2}/\d{2}/\d{4}")
    description: str
    category: str
    amount: float
    merchant_name: Optional[str] = None
    payers: List[GroupExpensePayerEntry]
    split: GroupSplitConfig


class PayerSummaryItem(BaseModel):
    member_id: str
    amount_paid: float


class GroupExpenseRow(BaseModel):
    row_id: str
    date: str
    description: str
    category: str
    cost: float
    merchant_name: Optional[str] = None
    my_share: float
    payer_summary: List[PayerSummaryItem]


class GroupExpenseCreatedResponse(BaseModel):
    success: bool
    expense: GroupExpenseRow


class GroupExpenseListResponse(BaseModel):
    items: List[GroupExpenseRow]
    next_offset: Optional[int] = None


class MemberBalance(BaseModel):
    member_id: str
    display_name: str
    net: float


class BalanceTransfer(BaseModel):
    from_member_id: str
    to_member_id: str
    amount: float


class BalanceResponse(BaseModel):
    group_id: str
    members: List[MemberBalance]
    transfers: List[BalanceTransfer]
    simplified: bool


# ---------------------- Email ---------------------- #

class SendEmailRequest(BaseModel):
    form_type: str  # e.g. 'feature_request', 'contact_us'
    user_email: str
    subject: str
    message_body: str
    name: Optional[str] = None


class SendEmailResponse(BaseModel):
    success: bool
    message: str = "Email sent"

