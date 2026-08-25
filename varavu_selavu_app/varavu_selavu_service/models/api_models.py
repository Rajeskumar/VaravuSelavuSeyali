from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, EmailStr, Field, conint

from varavu_selavu_service.core.money import (
    MAX_AMOUNT,
    MoneyAmount,
    NonNegativeMoney,
    OptionalNonNegativeMoney,
)
from varavu_selavu_service.core.text_sanitize import (
    CategoryStr,
    DescriptionStr,
    DisplayNameStr,
    NameStr,
    OptionalDisplayNameStr,
    OptionalMerchantStr,
    OptionalNameStr,
    OptionalNotesStr,
)

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str

class ExpenseRequest(BaseModel):
    user_id: str
    cost: MoneyAmount
    category: CategoryStr
    description: DescriptionStr
    date: str = Field(pattern=r"\d{2}/\d{2}/\d{4}")
    merchant_name: OptionalMerchantStr = None
    # TS-TAG-104 — full-replace on PUT (an omitted field leaves tags unchanged; an explicit
    # empty list clears them — see the route handler's use of `model_fields_set`). On POST
    # there's no prior state, so None/omitted and [] behave identically (no tags created).
    tag_names: Optional[List[str]] = None
    # TS-CARD-114: optional attribution of which held card was actually used. Must be one of
    # the caller's own UserCard entries (route validates via CardService) — never an arbitrary
    # catalog id. Always-replace on PUT, same semantics as merchant_name: the edit form always
    # populates this from the expense's current attribution, so null here always means "no
    # card attributed" rather than "leave unchanged" — no tag_names-style omitted/empty
    # distinction is needed since there's no separate additive write path for a single value.
    card_id: Optional[str] = None


class ReceiptParseResponse(BaseModel):
    header: Dict[str, Any]
    items: List[Dict[str, Any]]
    warnings: List[str]
    fingerprint: str
    ocr_text: str | None = None


class ExpenseItem(BaseModel):
    line_no: int
    item_name: DescriptionStr
    normalized_name: OptionalNameStr = None
    category_id: str | None = None
    quantity: float | None = None
    unit: str | None = None
    unit_price: OptionalNonNegativeMoney = None
    line_total: NonNegativeMoney
    tax: OptionalNonNegativeMoney = Decimal("0")
    discount: OptionalNonNegativeMoney = Decimal("0")
    attributes_json: str | None = None


class ExpenseWithItemsRequest(BaseModel):
    user_email: str
    header: Dict[str, Any]
    items: List[ExpenseItem]
    tag_names: Optional[List[str]] = None
    # TS-CARD-114: same optional held-card attribution as ExpenseRequest.card_id.
    card_id: Optional[str] = None


class ExpenseWithItemsResponse(BaseModel):
    expense_id: str
    item_ids: List[str]


class ExpenseItemDTO(BaseModel):
    id: str
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


class ItemsUpdateRequest(BaseModel):
    """Body for PUT .../items — full replace of an already-saved itemized expense's line
    items. `amount` is required (not derived) and validated to reconcile with the items'
    subtotal, mirroring create_expense_with_items's existing check."""
    items: List[ExpenseItem]
    amount: MoneyAmount
    tax: NonNegativeMoney = Decimal("0")
    discount: NonNegativeMoney = Decimal("0")


class ItemsResponse(BaseModel):
    items: List[ExpenseItemDTO]
    amount: float
    tax: float
    discount: float


class CategorizeRequest(BaseModel):
    """Request payload for expense categorization."""
    description: DescriptionStr


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


class FeatureFlagsResponse(BaseModel):
    # Client-visible flag surface (TS-GRP-111) — lets web/mobile hide Groups nav,
    # filters, and toggles without relying on a 404 probe against /groups.
    groups_enabled: bool
    # TS-ENT-105: same pattern, for the merchant/item typeahead + resolution
    # endpoints — lets web/mobile hide the typeahead UI without a 404 probe.
    entity_resolution_enabled: bool
    # TS-BUD-101: same pattern, for the Budgets tab/screen and its Dashboard/Analysis
    # integrations — defaults True (see Settings.BUDGETS_ENABLED), but still client-checked
    # for consistency with every other feature surface.
    budgets_enabled: bool
    # TS-CARD-101: same pattern, for the Analysis "Cards" tab and its Dashboard/AI Analyst
    # integrations — defaults False until the curated card_catalog (TS-CARD-102) is populated.
    card_coach_enabled: bool
    # TS-TAG-101: same pattern, for TagInput/tag filter surfaces on web/mobile — defaults False
    # until the retrieval surfaces (filter + bulk apply) ship (PRD §4.2).
    tags_enabled: bool


class DashboardResponse(BaseModel):
    total_expenses: float
    total_categories: int
    months_tracked: int


class TagRefDTO(BaseModel):
    """A tag as it appears embedded on an expense row (PRD §10.2's `tags: [{id, name, color}]`)
    — deliberately not the full TagDTO (no status/usage stats needed at this granularity)."""
    id: str
    name: str
    color: str


class CardRefDTO(BaseModel):
    """TS-CARD-114: the held card attributed to an expense, as embedded on an expense row.
    Deliberately not the full CardCatalog shape (no earning_rules/annual_fee/etc. needed at
    this granularity — a client that needs those already has the user's held-cards list
    loaded to power the picker in the first place)."""
    id: str
    card_name: str
    issuer: str


class Expense(BaseModel):
    user_id: str
    date: str = Field(pattern=r"\d{2}/\d{2}/\d{4}")
    description: str
    category: str
    cost: float
    merchant_name: Optional[str] = None
    # "has items worth viewing/editing" signal for the client — split_type is the reliable
    # marker for expenses created after this field started being set; item_count is a
    # fallback heuristic for older rows (every personal expense has >=1 synthesized proxy
    # item, so the UI should only treat item_count > 1 as "really itemized").
    item_count: int = 0
    split_type: Optional[str] = None
    # TS-TAG-103 — filtered to the caller (PRD §9.2); never another user's tags on a shared
    # group expense.
    tags: List[TagRefDTO] = Field(default_factory=list)
    # TS-CARD-114: which held card was actually used, if the user attributed one. None means
    # unattributed — CardRewardsEngine then falls back to the user's default held card.
    card: Optional[CardRefDTO] = None


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
    tag_ids: Optional[List[str]] = None


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
    # TS-TAG-106 (PRD §10.4) — share-aware totals, populated only when tag_ids is provided.
    my_expenses_total: Optional[float] = None
    i_paid_total: Optional[float] = None


class ResolvedPeriod(BaseModel):
    """
    The concrete date range the chat agent actually used for a turn (TS-ANL-013)
    — resolved from a natural-language phrase in the query, an explicit
    year/month/start_date/end_date param, or the current-month default, in that
    precedence order. `source` tells the client which of the three happened.
    """
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    label: str  # human-readable, e.g. "July 2026", "Q2 2026", "the last 3 months"
    source: Literal["parsed_from_query", "explicit_param", "default"]


class ResolvedScope(BaseModel):
    """The personal-vs-group scope the chat agent resolved for a turn (TS-ANL-013)."""
    kind: Literal["personal", "group"]
    group_id: Optional[str] = None
    group_name: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    resolved_period: ResolvedPeriod
    resolved_scope: ResolvedScope


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
    group_id: str | None = None
    split_config: Optional["GroupSplitConfig"] = None


class UpsertRecurringTemplateRequest(BaseModel):
    description: DescriptionStr
    category: CategoryStr
    merchant_name: OptionalMerchantStr = None
    day_of_month: conint(ge=1, le=31)  # type: ignore
    default_cost: MoneyAmount
    start_date_iso: str | None = None
    status: str = "Active"
    group_id: str | None = None
    split_config: Optional["GroupSplitConfig"] = None


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
    name: NameStr
    group_type: str = "other"  # trip|home|couple|other
    cover: Optional[str] = None
    currency: str = "USD"


class UpdateGroupRequest(BaseModel):
    name: OptionalNameStr = None
    group_type: Optional[str] = None
    cover: Optional[str] = None
    simplify_debts: Optional[bool] = None
    default_split: Optional["GroupSplitConfig"] = None
    currency: Optional[str] = None


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
    currency: str = "USD"
    member_count: int
    my_balance: float = 0.0
    status: str
    archived_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class GroupDetailResponse(BaseModel):
    group_id: str
    name: str
    group_type: str
    cover: Optional[str] = None
    currency: str
    simplify_debts: bool
    default_split: Optional["GroupSplitConfig"] = None
    archived_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    status: str
    members: List[MemberDTO]

class GroupActivityDTO(BaseModel):
    id: str
    action: str
    actor_member_id: Optional[str] = None
    entity_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    created_at: str

class GroupActivityListResponse(BaseModel):
    items: List[GroupActivityDTO]
    next_offset: Optional[int] = None

class AddMemberRequest(BaseModel):
    email: Optional[EmailStr] = None
    display_name: OptionalDisplayNameStr = None


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
    amount: MoneyAmount
    method: Optional[str] = None
    settled_at: Optional[str] = None  # ISO 8601; defaults to now() when omitted
    notes: OptionalNotesStr = None


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
    """
    Configuration for how an expense is divided among members.
    type: 'equal', 'exact', 'percentage', 'shares', 'adjustment' (Phase 1 & 2)
    entries: List of member-specific values (amounts or percentages or shares/adjustments).
             Required for all types except 'equal'.
    """
    type: str = Field(..., description="The split mechanism: equal, exact, percentage, shares, or adjustment")
    entries: List[GroupSplitEntry] = []


class GroupExpensePayerEntry(BaseModel):
    member_id: str
    # May be zero: a member can be listed as a payer contributing nothing.
    amount_paid: NonNegativeMoney


class GroupExpenseRequest(BaseModel):
    date: str = Field(pattern=r"\d{2}/\d{2}/\d{4}")
    description: DescriptionStr
    category: CategoryStr
    amount: MoneyAmount
    merchant_name: OptionalMerchantStr = None
    payers: List[GroupExpensePayerEntry]
    split: GroupSplitConfig
    # TS-GRP-131: currency this expense was actually paid in. None/omitted means
    # "same as the group's currency" (the common case — no FX lookup needed).
    currency: Optional[str] = None
    # TS-CARD-114: same optional held-card attribution as personal ExpenseRequest.card_id —
    # group expenses use full-replace here too (no separate association model needed for a
    # single nullable value the way tags needed one for a many-valued field).
    card_id: Optional[str] = None


class MoveToGroupRequest(BaseModel):
    """TS-GRP-121: converts an existing personal expense into a group expense
    in place. The converter becomes sole payer by default (E11)."""
    group_id: str
    split: GroupSplitConfig


class GroupExpenseItemEntry(BaseModel):
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
    member_ratios: Dict[str, float]


class GroupExpenseWithItemsRequest(BaseModel):
    date: str = Field(pattern=r"\d{2}/\d{2}/\d{4}")
    description: DescriptionStr
    category: CategoryStr
    amount: MoneyAmount
    merchant_name: OptionalMerchantStr = None
    payers: List[GroupExpensePayerEntry]
    items: List[GroupExpenseItemEntry]
    currency: Optional[str] = None
    # TS-CARD-114: same optional held-card attribution as GroupExpenseRequest.card_id.
    card_id: Optional[str] = None


class GroupExpenseWithItemsResponse(BaseModel):
    expense_id: str
    item_ids: List[str]
    my_share: float


class PayerSummaryItem(BaseModel):
    member_id: str
    amount_paid: float


class ExpenseSplitItem(BaseModel):
    member_id: str
    share: float


class GroupExpenseRow(BaseModel):
    row_id: str
    date: str
    description: str
    category: str
    cost: float
    merchant_name: Optional[str] = None
    my_share: float
    payer_summary: List[PayerSummaryItem]
    # Every member's actual current dollar share (TS-GRP edit-fidelity fix) — lets the UI show
    # who's involved directly on the expense, and lets Edit reconstruct the real current split
    # instead of resetting to an equal-split guess.
    splits: List[ExpenseSplitItem] = []
    currency: Optional[str] = None
    fx_rate_to_group_currency: Optional[float] = None
    split_type: Optional[str] = None
    # TS-TAG-103 — filtered to the caller (PRD §9.2, load-bearing): a tag applied to a shared
    # group expense is visible ONLY to the member who applied it, never other group members.
    tags: List[TagRefDTO] = Field(default_factory=list)
    # TS-CARD-114: which held card the payer attributed to this group expense, if any. Like
    # tags, this is per-attributing-member data on a shared expense, but there's no privacy
    # concern here the way tags had (spec never treated "which card I paid with" as private,
    # and CardRewardsEngine's own group-expense buckets are already scoped to i_paid amounts
    # the current user actually paid — see AnalysisService.compute_category_merchant_buckets).
    card: Optional[CardRefDTO] = None


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
    # TS-GRP-130: only populated for registered members, so the web/mobile
    # SettleUpDialog can offer a payment deep-link button.
    venmo_handle: Optional[str] = None
    paypal_handle: Optional[str] = None
    upi_id: Optional[str] = None


class BalanceTransfer(BaseModel):
    from_member_id: str
    to_member_id: str
    amount: float


class BalanceResponse(BaseModel):
    group_id: str
    members: List[MemberBalance]
    transfers: List[BalanceTransfer]
    simplified: bool


# ---------------------- Devices (TS-GRP-110) ---------------------- #

class RegisterDeviceRequest(BaseModel):
    expo_push_token: str
    platform: str  # ios|android


class RegisterDeviceResponse(BaseModel):
    success: bool


# ---------------------- Email ---------------------- #

class SendEmailRequest(BaseModel):
    form_type: str  # e.g. 'feature_request', 'contact_us'
    user_email: str
    subject: str
    message_body: str
    name: OptionalNameStr = None


class SendEmailResponse(BaseModel):
    success: bool
    message: str = "Email sent"


# ---------------------- Notification preferences (TS-GRP-125) ---------------------- #

class GroupNotificationPreferenceDTO(BaseModel):
    group_id: str
    muted: bool
    muted_events: List[str]


class UpdateNotificationPreferenceRequest(BaseModel):
    muted: Optional[bool] = None
    muted_events: Optional[List[str]] = None


# ---------------------- Expense comments (TS-GRP-126) ---------------------- #

class AddCommentRequest(BaseModel):
    body: str


class ExpenseCommentDTO(BaseModel):
    id: str
    expense_id: str
    member_id: str
    author_display_name: str
    body: str
    created_at: str
    edited_at: Optional[str] = None


class ExpenseCommentListResponse(BaseModel):
    items: List[ExpenseCommentDTO]


# ---------------------- Expense edit history (TS-GRP-127) ---------------------- #

class ExpenseHistoryEntryDTO(BaseModel):
    action: str
    actor_display_name: str
    changed_fields: Dict[str, Any]
    created_at: str


class ExpenseHistoryResponse(BaseModel):
    items: List[ExpenseHistoryEntryDTO]


# ---------------------- Cross-group friend balances (TS-GRP-128) ---------------------- #

class FriendBalanceGroupBreakdown(BaseModel):
    group_id: str
    name: str
    net: float


class FriendBalanceDTO(BaseModel):
    counterparty_email: Optional[str] = None
    counterparty_display_name: str
    net: float
    groups: List[FriendBalanceGroupBreakdown]


class FriendBalancesResponse(BaseModel):
    balances: List[FriendBalanceDTO]


# ---------------------- Settle-by-expense (TS-GRP-129) ---------------------- #

class SettleExpenseShareRequest(BaseModel):
    member_id: str
    payer_member_id: Optional[str] = None
    method: Optional[str] = None
    notes: OptionalNotesStr = None


# ---------------------- Payment deep links (TS-GRP-130) ---------------------- #

class PaymentHandlesDTO(BaseModel):
    venmo_handle: Optional[str] = None
    paypal_handle: Optional[str] = None
    upi_id: Optional[str] = None


class UpdatePaymentHandlesRequest(BaseModel):
    venmo_handle: Optional[str] = None
    paypal_handle: Optional[str] = None
    upi_id: Optional[str] = None


# ---------------------- AI split suggestions (TS-GRP-133) ---------------------- #

class SplitSuggestionDTO(BaseModel):
    member_id: str
    display_name: str
    confidence: str  # high|medium|low
    times_assigned: int


class SplitSuggestionResponse(BaseModel):
    suggestions: List[SplitSuggestionDTO]


# ---------------------- Smart Entity Resolution (TS-ENT-1xx) ---------------------- #
# docs/features/smart_entity/TrackSpense_Smart_Entity_Resolution_Spec.md §10

class EntitySuggestionDTO(BaseModel):
    id: str
    display_name: str
    score: float
    category_id: Optional[str] = None


class SuggestResponse(BaseModel):
    suggestions: List[EntitySuggestionDTO]


class ResolveRequest(BaseModel):
    raw: str
    brand: Optional[str] = None  # items only; ignored for merchants


class CanonicalRefDTO(BaseModel):
    id: str
    display_name: str
    category_id: Optional[str] = None


class ResolveCandidateDTO(BaseModel):
    id: str
    display_name: str
    score: float
    category_id: Optional[str] = None


class ResolveResponse(BaseModel):
    status: str  # "linked" | "suggested" | "new"
    canonical: Optional[CanonicalRefDTO] = None
    candidates: List[ResolveCandidateDTO] = []


class CreateCanonicalMerchantRequest(BaseModel):
    display_name: DisplayNameStr
    default_category_id: Optional[str] = None


class CreateCanonicalItemRequest(BaseModel):
    display_name: DisplayNameStr
    brand: Optional[str] = None
    default_category_id: Optional[str] = None
    unit_type: Optional[str] = None


class CanonicalMerchantDTO(BaseModel):
    id: str
    canonical_name: str
    display_name: str
    default_category_id: Optional[str] = None
    is_global: bool


class CanonicalItemDTO(BaseModel):
    id: str
    canonical_name: str
    display_name: str
    brand: Optional[str] = None
    default_category_id: Optional[str] = None
    unit_type: Optional[str] = None
    is_global: bool


# ---------------------- Budgets (TS-BUD-101) ---------------------- #

BudgetScope = Literal["personal", "combined"]
BudgetTargetType = Literal["overall", "category"]
BudgetStatus = Literal["on_track", "at_risk", "over_pace", "exceeded"]

DEFAULT_ALERT_THRESHOLDS = [80, 100]


class CreateBudgetRequest(BaseModel):
    """FR-1/FR-2: creating a budget for a (scope, category, period_type) that already has one
    edits the existing budget in place instead of erroring or duplicating (BudgetService)."""
    scope: BudgetScope = "personal"
    target_type: BudgetTargetType
    category: Optional[CategoryStr] = None
    amount: MoneyAmount
    currency: str = "USD"
    rollover: bool = False
    alert_thresholds: List[int] = Field(default_factory=lambda: list(DEFAULT_ALERT_THRESHOLDS))


class UpdateBudgetRequest(BaseModel):
    """All fields optional — PATCH semantics, only supplied fields change."""
    amount: Optional[MoneyAmount] = None
    rollover: Optional[bool] = None
    alert_thresholds: Optional[List[int]] = None
    muted: Optional[bool] = None


class BudgetDTO(BaseModel):
    id: str
    scope: BudgetScope
    target_type: BudgetTargetType
    category: Optional[str] = None
    amount: float
    currency: str
    period_type: str
    rollover: bool
    alert_thresholds: List[int]
    muted: bool
    period_start: str  # YYYY-MM-DD
    period_end: str  # YYYY-MM-DD
    # Live ledger figures (§5.2) — spent/committed always use AnalysisService's scope-aware
    # sums, never a second calculation path (spec §8 consistency requirement).
    spent: float
    committed: float
    remaining: float
    projected: float
    status: BudgetStatus
    # True once this period has ended and the figures above were read from an immutable
    # BudgetPeriodSnapshot (FR-7/FR-8) rather than computed live off the current ledger.
    is_snapshot: bool = False


class BudgetTransactionRow(BaseModel):
    date: str
    description: str
    category: str
    cost: float
    # Known simplification: AnalysisService's merged category_expense_details rows (the shared
    # calculation path this reuses, per the spec §8 consistency requirement) don't currently tag
    # personal-vs-group at the individual-row level for combined scope, so these stay unset
    # rather than guessed. Personal-scope budgets are unambiguous (every row is personal).
    kind: Optional[Literal["personal", "group"]] = None
    group_name: Optional[str] = None


class BudgetBreakdownResponse(BaseModel):
    """Feeds the "Ask why" affordance (§5.4) — the budget's own live figures plus every
    transaction that contributed to `spent` this period."""
    budget: BudgetDTO
    transactions: List[BudgetTransactionRow]


class BudgetSuggestion(BaseModel):
    """§5.4 — median of the last 3 months' spend per category, a one-tap starting point when
    creating a new budget. Suggestion only; never auto-applied."""
    category: str
    suggested_amount: float
    based_on_months: int


class BudgetAskWhyResponse(BaseModel):
    """§5.4 "Ask why" — a plain-language explanation generated from the budget's own live
    figures plus its contributing transactions (BudgetService.build_ask_why_prompt), reusing
    the same chat model dispatch as /analysis/chat rather than a second AI integration path."""
    response: str


# ---------------------- Card Coach (TS-CARD series) ---------------------- #

class CardEarningRuleDTO(BaseModel):
    id: str
    # Exactly one of category_id/merchant_name is set (TS-CARD-113) — category_id is a bare
    # sub-category string (matches Expense.category_id) or "All Purchases"; merchant_name is
    # matched case-insensitively against Expense.merchant_name and always takes precedence over
    # a category rule when both could apply to the same spend.
    category_id: Optional[str] = None
    merchant_name: Optional[str] = None
    multiplier: float
    cap_amount: Optional[float] = None
    cap_period: Optional[str] = None
    exclusions_note: Optional[str] = None
    rotation_start: Optional[str] = None  # YYYY-MM-DD
    rotation_end: Optional[str] = None  # YYYY-MM-DD


class CardCatalogSummary(BaseModel):
    """Lightweight shape for catalog search results — no earning rules (spec §7 GET /cards/catalog)."""
    id: str
    issuer: str
    card_name: str
    reward_type: str
    annual_fee: float
    is_custom: bool = False


class CardCatalogDetail(BaseModel):
    """Full catalog card detail per spec Appendix, including provenance (§9.4). source_url/
    last_verified_at are None for a custom card (TS-CARD-112) — no issuer source to cite."""
    id: str
    issuer: str
    card_name: str
    reward_type: str
    points_currency_name: Optional[str] = None
    point_value_estimate_usd: Optional[float] = None
    annual_fee: float
    earning_rules: List[CardEarningRuleDTO]
    source_url: Optional[str] = None
    last_verified_at: Optional[str] = None  # ISO datetime
    is_active: bool
    is_custom: bool = False


class UserCardDTO(BaseModel):
    """A held card, joined with its catalog summary so the UI doesn't need a second fetch."""
    id: str  # user_cards.id
    card_id: str
    issuer: str
    card_name: str
    reward_type: str
    is_default: bool
    is_custom: bool = False
    added_at: str  # ISO datetime


class AddUserCardRequest(BaseModel):
    card_id: str


class CustomCardEarningRuleInput(BaseModel):
    """TS-CARD-112 — category_id is validated against the app's real taxonomy in
    CardService.create_custom_card, same categories a curated card's rules use."""
    category_id: str
    multiplier: float = Field(gt=0, le=100)


class CreateCustomCardRequest(BaseModel):
    """POST /cards/custom — self-reported card, cashback-only for v1 (spec follow-up decision).
    Creates the catalog row and adds it to the user's held cards in one call, since a custom
    card only ever belongs to its creator."""
    issuer: Optional[str] = None
    card_name: DescriptionStr
    annual_fee: NonNegativeMoney = 0
    rules: List[CustomCardEarningRuleInput] = Field(default_factory=list)


class CardCorrectionRequest(BaseModel):
    """POST /cards/corrections — spec §5 item 6, §9.4."""
    card_id: str
    note: DescriptionStr


class CardCorrectionDTO(BaseModel):
    id: str
    card_id: str
    note: str
    status: str
    created_at: str


class CardCoachPeriod(BaseModel):
    year: Optional[int] = None
    month: Optional[int] = None


class CardCoachCategoryDTO(BaseModel):
    category: str
    actual_spend: float
    # "personal_plus_group_paid" when GROUPS_ENABLED (spec §8.2 — full paid amount, not "my
    # share"), else "personal_only". Same for every row in one response.
    spend_source: str
    actual_earned_estimate: Optional[float] = None
    held_card_used: Optional[str] = None
    # TS-CARD-113: deliberately a simple, category-only, single-card comparison — never
    # merchant-aware, since "which card is optimal" can be genuinely ambiguous once a category
    # mixes merchant and non-merchant spend across multiple cards. That's exactly what the
    # separate by_merchant view (CardCoachResponse) exists to resolve precisely instead.
    optimal_in_wallet_card: Optional[str] = None
    optimal_in_wallet_earned_estimate: Optional[float] = None
    optimal_catalog_card: Optional[str] = None
    optimal_catalog_earned_estimate: Optional[float] = None
    cap_note: Optional[str] = None
    # Phase 2 "better card" nudge: True when the card used for "actual" is already the same card
    # as "optimal_in_wallet" (by id, not display name — two cards, e.g. a custom card and a
    # catalog card, can share a name). Defaults True (no nudge) whenever there's nothing to
    # compare, matching gap_usd's "never fabricate a gap when uncertain" rule.
    is_using_best_held_card: bool = True


class CardCoachMerchantDTO(BaseModel):
    """TS-CARD-113 — only present for merchants at least one held/catalog card has an explicit
    rule for; unlike the category view, all three figures here (actual/optimal-in-wallet/
    optimal-catalog) are merchant-precedence-aware and unambiguous, since a single merchant is
    never "mixed" the way a category can be."""
    merchant: str
    actual_spend: float
    spend_source: str
    actual_earned_estimate: Optional[float] = None
    held_card_used: Optional[str] = None
    optimal_in_wallet_card: Optional[str] = None
    optimal_in_wallet_earned_estimate: Optional[float] = None
    optimal_catalog_card: Optional[str] = None
    optimal_catalog_earned_estimate: Optional[float] = None
    cap_note: Optional[str] = None
    is_using_best_held_card: bool = True


class CardCoachFilterInfo(BaseModel):
    year: Optional[int] = None
    month: Optional[int] = None
    group_share_included: bool


class CardCoachResponse(BaseModel):
    period: CardCoachPeriod
    total_estimated_gap: float
    by_category: List[CardCoachCategoryDTO]
    by_merchant: List[CardCoachMerchantDTO] = Field(default_factory=list)
    filter_info: CardCoachFilterInfo


# ---------------------- TS-TAG-102: Tag CRUD ---------------------- #

class TagCreateRequest(BaseModel):
    name: str
    color: Optional[str] = None


class TagUpdateRequest(BaseModel):
    """All fields optional — PUT applies only what's provided. `status` is 'Active' | 'Archived'."""
    name: Optional[str] = None
    color: Optional[str] = None
    status: Optional[str] = None


class TagDTO(BaseModel):
    id: str
    name: str
    color: str
    status: str
    created_at: datetime
    # Derived, not stored (PRD §8.1) — computed from expense_tags in the same query that ranks
    # autocomplete, never persisted on the tag row.
    usage_count: int
    last_used_at: Optional[datetime] = None


class TagApplyRequest(BaseModel):
    """PRD §10.2 — either or both may be given; tag_names are created-or-resolved."""
    tag_ids: List[str] = Field(default_factory=list)
    tag_names: List[str] = Field(default_factory=list)


class TagBulkFilterDTO(BaseModel):
    start_date: Optional[str] = None  # YYYY-MM-DD
    end_date: Optional[str] = None
    group_id: Optional[str] = None
    category: Optional[str] = None
    merchant_name: Optional[str] = None


class TagBulkRequest(BaseModel):
    """PRD §10.3 — exactly one of tag_id/tag_name, and exactly one of expense_ids/filter."""
    tag_id: Optional[str] = None
    tag_name: Optional[str] = None
    expense_ids: Optional[List[str]] = None
    filter: Optional[TagBulkFilterDTO] = None
    dry_run: bool = True


class TagBulkResponse(BaseModel):
    matched_count: int
    already_tagged_count: int
    applied_count: int
    my_expenses_total: float
    i_paid_total: float

