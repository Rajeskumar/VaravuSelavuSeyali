from fastapi import APIRouter, Response, Depends, status, Query, File, UploadFile, HTTPException, BackgroundTasks, Request
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi.responses import StreamingResponse

from varavu_selavu_service.models.api_models import (
    ExpenseRequest,
    ReceiptParseResponse,
    ExpenseWithItemsRequest,
    ExpenseWithItemsResponse,
    CategorizeRequest,
    CategorizeResponse,
    ChatRequest,
    HealthResponse,
    FeatureFlagsResponse,
    DashboardResponse,
    ExpenseCreatedResponse,
    ExpenseRow,
    AnalysisResponse,
    ChatResponse,
    ModelListResponse,
    ExpenseListResponse,
    ExpenseDeleteResponse,
    ItemsUpdateRequest,
    ItemsResponse,
    ExpenseItemDTO,
)
from varavu_selavu_service.core.money import to_decimal, validate_money_amount
from varavu_selavu_service.services.expense_service import ExpenseService
from varavu_selavu_service.services.personal_export_service import PersonalExportService
from varavu_selavu_service.services.receipt_service import ReceiptService
from varavu_selavu_service.repo.postgres_repo import PostgresRepo
from varavu_selavu_service.services.chat_service import (
    call_chat_model,
    list_openai_models,
    list_ollama_models,
    list_gemini_models,
)
from varavu_selavu_service.services.analysis_service import AnalysisService
from varavu_selavu_service.services.analytics_service import AnalyticsService
from varavu_selavu_service.services.insights_aggregation_service import InsightsAggregationService
from varavu_selavu_service.services.categorization_service import CategorizationService
from varavu_selavu_service.services.recurring_service import RecurringService
from varavu_selavu_service.core.config import Settings
from sqlalchemy.orm import Session
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.auth.routers import router as auth_router
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.api.groups_routes import (
    router as groups_router,
    friends_router,
    expenses_router as group_conversion_router,
    get_group_service,
    get_balance_service,
)
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.balance_service import BalanceService
from varavu_selavu_service.api.devices_routes import router as devices_router
from varavu_selavu_service.api.entity_resolution_routes import router as entity_resolution_router
from varavu_selavu_service.models.api_models import (
    RecurringTemplateDTO,
    UpsertRecurringTemplateRequest,
    DueOccurrenceDTO,
    ConfirmRecurringRequest,
    SendEmailRequest,
    SendEmailResponse,
    ChangeInsight,
    BudgetDTO,
    CreateBudgetRequest,
    UpdateBudgetRequest,
    BudgetBreakdownResponse,
    BudgetSuggestion,
    BudgetAskWhyResponse,
)
from varavu_selavu_service.services.budget_service import BudgetService
from varavu_selavu_service.services.insight_analytics_service import InsightAnalyticsService
from varavu_selavu_service.services.group_expense_service import GroupExpenseService
from varavu_selavu_service.services.notification_service import NotificationService
from varavu_selavu_service.api.groups_routes import get_group_expense_service, get_notification_service
from varavu_selavu_service.db.models import ExpenseSplit, Expense
import uuid as _uuid
from varavu_selavu_service.core.limiter import limiter

settings = Settings()

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router, prefix="/auth")
router.include_router(groups_router)
router.include_router(friends_router)
router.include_router(group_conversion_router)
router.include_router(devices_router)
router.include_router(entity_resolution_router)

# Dependency providers
def get_expense_service(db: Session = Depends(get_db)) -> ExpenseService:
    return ExpenseService(db)

def get_personal_export_service(db: Session = Depends(get_db)) -> PersonalExportService:
    return PersonalExportService(db)

def get_analysis_service(db: Session = Depends(get_db)) -> AnalysisService:
    return AnalysisService(db=db, ttl_sec=settings.ANALYSIS_CACHE_TTL_SEC)

def get_analytics_service(db: Session = Depends(get_db)) -> AnalyticsService:
    return AnalyticsService(db)

def get_insights_aggregation_service(db: Session = Depends(get_db)) -> InsightsAggregationService:
    return InsightsAggregationService(db)


def get_receipt_service() -> ReceiptService:
    return ReceiptService(engine=settings.OCR_ENGINE)


def get_postgres_repo(db: Session = Depends(get_db)) -> PostgresRepo:
    return PostgresRepo(db=db)


def get_categorization_service() -> CategorizationService:
    return CategorizationService()

def get_recurring_service(db: Session = Depends(get_db)) -> RecurringService:
    return RecurringService(db)

def get_budget_service(db: Session = Depends(get_db)) -> BudgetService:
    return BudgetService(db)

def require_budgets_enabled() -> None:
    # Same pattern as groups_routes.require_groups_enabled — reads Settings() fresh so the flag
    # can be toggled at runtime/in tests without reloading this module.
    if not Settings().BUDGETS_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

def get_insight_analytics_service(db: Session = Depends(get_db)) -> InsightAnalyticsService:
    return InsightAnalyticsService(db=db)

@router.get("/healthz", response_model=HealthResponse, tags=["Health"], summary="Liveness probe")
def health_check():
    return {"status": "healthy"}

@router.get("/readyz", response_model=HealthResponse, tags=["Health"], summary="Readiness probe")
def readiness_check():
    # Extend with checks to downstream services (e.g., Google Sheets) if needed
    return {"status": "healthy"}


@router.get("/config", response_model=FeatureFlagsResponse, tags=["Health"], summary="Client-visible feature flags")
def get_config():
    # Reads Settings() fresh (not the module-level `settings` singleton) so it
    # reflects the same runtime-toggleable value groups_routes.require_groups_enabled
    # checks — no auth required, this is non-sensitive app config, not user data.
    settings_now = Settings()
    return {
        "groups_enabled": settings_now.GROUPS_ENABLED,
        "entity_resolution_enabled": settings_now.ENTITY_RESOLUTION_ENABLED,
        "budgets_enabled": settings_now.BUDGETS_ENABLED,
    }


@router.post(
    "/expenses/categorize",
    response_model=CategorizeResponse,
    tags=["Expenses"],
    summary="Suggest category and subcategory for a description",
)
@limiter.limit("10/minute")
def categorize_expense(
    request: Request,
    data: CategorizeRequest,
    categorizer: CategorizationService = Depends(get_categorization_service),
    _: str = Depends(auth_required),
):
    main, sub, merchant = categorizer.classify(data.description)
    return {"main_category": main, "subcategory": sub, "merchant_name": merchant}


@router.post(
    "/expenses",
    status_code=status.HTTP_201_CREATED,
    response_model=ExpenseCreatedResponse,
    tags=["Expenses"],
    summary="Create a new expense",
)
def create_expense(
    data: ExpenseRequest,
    background_tasks: BackgroundTasks,
    expense_service: ExpenseService = Depends(get_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    aggregation_svc: InsightsAggregationService = Depends(get_insights_aggregation_service),
    user_id: str = Depends(auth_required),
):
    saved = expense_service.add_expense(
        user_id=user_id,
        date=data.date,
        description=data.description,
        category=data.category,
        cost=data.cost,
        merchant_name=data.merchant_name,
    )
    # Invalidate analysis cache on writes
    analysis_service.invalidate_cache()
    
    # Asynchronous insight aggregation
    background_tasks.add_task(
        aggregation_svc.on_simple_expense_created,
        user_email=user_id,
        merchant_name=data.merchant_name,
        purchased_at=datetime.strptime(saved["date"], "%m/%d/%Y"),
        amount=data.cost
    )
    
    # Normalize to response model shape
    expense_payload = {
        "user_id": saved.get("User ID", user_id),
        "date": data.date,
        "description": saved.get("description", data.description),
        "category": saved.get("category", data.category),
        "cost": float(saved.get("cost", data.cost)),
        "merchant_name": saved.get("merchant_name"),
    }
    return {"success": True, "expense": expense_payload}


@router.get(
    "/expenses/export.csv",
    tags=["Expenses"],
    summary="Export all my personal expenses as CSV",
)
def export_personal_expenses_csv(
    start_date: Optional[str] = Query(None, description="Inclusive MM/DD/YYYY lower bound"),
    end_date: Optional[str] = Query(None, description="Inclusive MM/DD/YYYY upper bound"),
    svc: PersonalExportService = Depends(get_personal_export_service),
    user_id: str = Depends(auth_required),
):
    csv_text = svc.export_csv(user_id, start_date=start_date, end_date=end_date)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="trackspense_expenses.csv"'},
    )


@router.get(
    "/expenses",
    response_model=ExpenseListResponse,
    tags=["Expenses"],
    summary="List expenses for a user",
)
def list_expenses(
    limit: int = Query(30, ge=1),
    offset: int = Query(0, ge=0),
    expense_service: ExpenseService = Depends(get_expense_service),
    user_id: str = Depends(auth_required),
):
    expenses = expense_service.get_expenses_for_user(user_id)
    expenses.sort(key=lambda r: datetime.strptime(r["date"], "%m/%d/%Y"), reverse=True)
    sliced = expenses[offset : offset + limit]
    next_offset = offset + limit if offset + limit < len(expenses) else None
    return {"items": sliced, "next_offset": next_offset}


@router.put(
    "/expenses/{row_id}",
    response_model=ExpenseCreatedResponse,
    tags=["Expenses"],
    summary="Update an existing expense",
)
def update_expense(
    row_id: str,
    data: ExpenseRequest,
    background_tasks: BackgroundTasks,
    expense_service: ExpenseService = Depends(get_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    aggregation_svc: InsightsAggregationService = Depends(get_insights_aggregation_service),
    user_id: str = Depends(auth_required),
):
    saved, old_data = expense_service.update_expense(
        row_id=row_id,
        user_id=user_id,
        date=data.date,
        description=data.description,
        category=data.category,
        cost=data.cost,
        merchant_name=data.merchant_name,
    )
    analysis_service.invalidate_cache()
    
    if old_data:
        background_tasks.add_task(
            aggregation_svc.on_simple_expense_updated,
            user_email=user_id,
            old_merchant_name=old_data["merchant_name"],
            old_amount=old_data["amount"],
            old_purchased_at=old_data["purchased_at"],
            new_merchant_name=data.merchant_name,
            new_amount=data.cost,
            new_purchased_at=datetime.strptime(saved["date"], "%m/%d/%Y")
        )
        
    expense_payload = {
        "user_id": saved.get("User ID", user_id),
        "date": data.date,
        "description": saved.get("description", data.description),
        "category": saved.get("category", data.category),
        "cost": float(saved.get("cost", data.cost)),
        "merchant_name": saved.get("merchant_name"),
    }
    return {"success": True, "expense": expense_payload}


@router.delete(
    "/expenses/{row_id}",
    response_model=ExpenseDeleteResponse,
    tags=["Expenses"],
    summary="Delete an expense",
)
def delete_expense(
    row_id: str,
    background_tasks: BackgroundTasks,
    expense_service: ExpenseService = Depends(get_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    aggregation_svc: InsightsAggregationService = Depends(get_insights_aggregation_service),
    _: str = Depends(auth_required),
):
    deleted_data = expense_service.delete_expense(row_id)
    analysis_service.invalidate_cache()
    
    if deleted_data:
        background_tasks.add_task(
            aggregation_svc.on_expense_deleted,
            user_email=deleted_data["user_email"],
            merchant_name=deleted_data["merchant_name"],
            amount=deleted_data["amount"],
            purchased_at=deleted_data["purchased_at"],
            items=deleted_data.get("items", [])
        )
        
    return {"success": True}


@router.get("/dashboard", response_model=DashboardResponse, tags=["Dashboard"], summary="Basic dashboard metrics")
def dashboard():
    # Dummy dashboard data
    return {
        "total_expenses": 1234.56,
        "total_categories": 12,
        "months_tracked": 5
    }

# ---------------------- Analytics ---------------------- #

@router.get("/analytics/changes", response_model=list[ChangeInsight], tags=["Analytics"], summary="Get spend change insights")
def get_change_insights(
    start_date: str | None = None,
    end_date: str | None = None,
    year: int | None = None,
    month: int | None = None,
    insight_service: InsightAnalyticsService = Depends(get_insight_analytics_service),
    user_id: str = Depends(auth_required),
):
    """
    Returns insight cards explaining what changed in a selected period compared
    to a previous comparable period across categories, merchants, and items.
    """
    return insight_service.calculate_change_insights(
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        year=year,
        month=month,
    )

@router.get("/analytics/items", tags=["Analytics"], summary="Get top items")
def get_top_items(
    limit: int = Query(20, ge=1),
    start_date: str | None = None,
    end_date: str | None = None,
    year: int | None = None,
    month: int | None = None,
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    insight_service: InsightAnalyticsService = Depends(get_insight_analytics_service),
    user_id: str = Depends(auth_required),
):
    if start_date or end_date or year is not None or month is not None:
        return insight_service.calculate_item_metrics(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            year=year,
            month=month,
            limit=limit,
        )
    return analytics_service.get_top_items(user_id, limit)

@router.get("/analytics/items/{item_name}", tags=["Analytics"], summary="Get item details")
def get_item_detail(
    item_name: str,
    start_date: str | None = None,
    end_date: str | None = None,
    year: int | None = None,
    month: int | None = None,
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    insight_service: InsightAnalyticsService = Depends(get_insight_analytics_service),
    user_id: str = Depends(auth_required),
):
    if start_date or end_date or year is not None or month is not None:
        detail = insight_service.calculate_item_detail(
            user_id=user_id,
            item_name=item_name,
            start_date=start_date,
            end_date=end_date,
            year=year,
            month=month
        )
    else:
        detail = analytics_service.get_item_detail(user_email=user_id, item_name=item_name)
        
    if not detail:
        raise HTTPException(status_code=404, detail="Item not found")
    return detail

@router.get("/analytics/merchants", tags=["Analytics"], summary="Get top merchants")
def get_top_merchants(
    limit: int = Query(20, ge=1),
    start_date: str | None = None,
    end_date: str | None = None,
    year: int | None = None,
    month: int | None = None,
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    insight_service: InsightAnalyticsService = Depends(get_insight_analytics_service),
    user_id: str = Depends(auth_required),
):
    if start_date or end_date or year is not None or month is not None:
        return insight_service.calculate_merchant_metrics(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            year=year,
            month=month,
            limit=limit,
        )
    return analytics_service.get_top_merchants(user_id, limit)

@router.get("/analytics/merchants/{merchant_name}", tags=["Analytics"], summary="Get merchant details")
def get_merchant_detail(
    merchant_name: str,
    start_date: str | None = None,
    end_date: str | None = None,
    year: int | None = None,
    month: int | None = None,
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    insight_service: InsightAnalyticsService = Depends(get_insight_analytics_service),
    user_id: str = Depends(auth_required),
):
    if start_date or end_date or year is not None or month is not None:
        detail = insight_service.calculate_merchant_detail(
            user_id=user_id,
            merchant_name=merchant_name,
            start_date=start_date,
            end_date=end_date,
            year=year,
            month=month,
        )
    else:
        detail = analytics_service.get_merchant_detail(user_email=user_id, merchant_name=merchant_name)

    if not detail:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return detail

@router.get(
    "/analysis",
    response_model=AnalysisResponse,
    tags=["Analysis"],
    summary="Get expense analysis",
)
def analysis(
    year: int | None = Query(default=None, ge=1970, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    start_date: str | None = None,
    end_date: str | None = None,
    scope: str = Query(default="personal", pattern="^(personal|combined|groups|i_paid|group_total)$"),
    group_id: str | None = None,
    response: Response = None,
    analysis_service: AnalysisService = Depends(get_analysis_service),
    user_id: str = Depends(auth_required),
):
    """Return analysis for a given user via the AnalysisService."""
    if not Settings().GROUPS_ENABLED:
        # Feature flag gate (TS-GRP-111, spec §13.4). scope/group_id stay accepted
        # (no error) so already-updated clients don't break, but they're silently
        # downgraded to personal-only — group data must not be reachable via
        # /analysis with the flag off, regardless of what a client requests.
        scope = "personal"
        group_id = None
    result = analysis_service.analyze(
        user_id=user_id,
        year=year,
        month=month,
        start_date=start_date,
        end_date=end_date,
        use_cache=True,
        scope=scope,
        group_id=group_id,
    )
    if response is not None:
        # Align Cache-Control header with service TTL
        response.headers["Cache-Control"] = f"public, max-age={analysis_service.ttl_sec}"
    return result


@router.post(
    "/analysis/chat",
    response_model=ChatResponse,
    tags=["Analysis"],
    summary="Ask a question about your expenses",
)
@limiter.limit("5/minute")
def analysis_chat(
    request: Request,
    body: ChatRequest,
    response: Response = None,
    analysis_service: AnalysisService = Depends(get_analysis_service),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    insight_service: InsightAnalyticsService = Depends(get_insight_analytics_service),
    group_service: GroupService = Depends(get_group_service),
    balance_service: BalanceService = Depends(get_balance_service),
    expense_service: ExpenseService = Depends(get_expense_service),
    group_expense_service: GroupExpenseService = Depends(get_group_expense_service),
    user_id: str = Depends(auth_required),
):
    """
    Accepts a chat query and returns a response generated by the AI model.
    The user is derived from the JWT token for security.
    """
    try:
        result = call_chat_model(
            messages=body.messages,
            user_id=user_id,
            analysis_service=analysis_service,
            analytics_service=analytics_service,
            insight_service=insight_service,
            group_service=group_service,
            balance_service=balance_service,
            expense_service=expense_service,
            group_expense_service=group_expense_service,
            groups_enabled=settings.GROUPS_ENABLED,
            model=body.model,
            provider=body.provider,
            year=body.year,
            month=body.month,
            start_date=body.start_date,
            end_date=body.end_date,
        )
        return {
            "response": result.response,
            "resolved_period": result.resolved_period,
            "resolved_scope": result.resolved_scope,
        }
    except HTTPException:
        raise
    except Exception as exc:
        import logging
        logging.getLogger("varavu_selavu.routes").exception("AI chat failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="The AI analyst is temporarily unavailable. Please try again later."
        )


@router.post(
    "/ingest/receipt/parse",
    response_model=ReceiptParseResponse,
    tags=["Expenses"],
    summary="OCR and parse a receipt without persisting",
)
@limiter.limit("3/minute")
def parse_receipt(
    request: Request,
    file: UploadFile = File(...),
    save_ocr_text: bool = False,
    receipt_service: ReceiptService = Depends(get_receipt_service),
    _: str = Depends(auth_required),
):
    data = file.file.read()
    return receipt_service.parse(
        data,
        content_type=file.content_type or "image/png",
        save_ocr_text=save_ocr_text,
    )


@router.post(
    "/expenses/with_items",
    response_model=ExpenseWithItemsResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Expenses"],
    summary="Create an expense with itemized lines",
)
def create_expense_with_items(
    payload: ExpenseWithItemsRequest,
    repo: PostgresRepo = Depends(get_postgres_repo),
    aggregation_svc: InsightsAggregationService = Depends(get_insights_aggregation_service),
    user_id: str = Depends(auth_required),
    force: bool = Query(False),
):
    header = payload.header
    items = [i.dict(exclude_unset=True) for i in payload.items]
    required_header = ["purchased_at", "amount"]
    for field in required_header:
        if field not in header:
            raise HTTPException(status_code=400, detail=f"Missing header field {field}")
    for item in items:
        if "item_name" not in item or "line_total" not in item:
            raise HTTPException(status_code=400, detail="Invalid item")
    # `header` is an untyped dict, so its amount has not been through the
    # constrained money types the way a declared field would have been.
    amount = validate_money_amount(header["amount"], field_name="amount")
    header = {**header, "amount": amount}
    subtotal = sum(((i.get("line_total") or Decimal("0")) for i in items), Decimal("0"))
    tax = to_decimal(header.get("tax"))
    tip = to_decimal(header.get("tip"))
    discount = to_decimal(header.get("discount"))
    if abs(subtotal + tax + tip - discount - amount) > Decimal("0.02"):
        raise HTTPException(status_code=400, detail="Totals do not reconcile")
    existing = repo.find_expense_by_fingerprint(user_id, header.get("fingerprint", ""))
    if existing and not force:
        raise HTTPException(status_code=409, detail={"expense_id": existing.get("id")})
    expense_id = repo.append_expense({**header, "user_email": user_id, "split_type": "itemized"})
    try:
        item_ids = repo.append_items(user_id, expense_id, items)
    except Exception:
        repo.delete_expense(expense_id)
        raise

    # Trigger insights aggregation for item + merchant tracking
    try:
        aggregation_svc.on_expense_with_items_created(
            user_email=user_id,
            expense_id=expense_id,
            merchant_name=header.get("merchant_name"),
            purchased_at=header.get("purchased_at") if isinstance(header.get("purchased_at"), datetime) else None,
            items=items,
        )
    except Exception as exc:
        import logging as _log
        _log.getLogger("varavu_selavu.routes").warning("Insights aggregation failed: %s", exc)

    return {"expense_id": expense_id, "item_ids": item_ids}


def _get_owned_personal_expense(db: Session, expense_id: str, user_id: str) -> Expense:
    try:
        parsed_id = _uuid.UUID(str(expense_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Expense not found")
    expense = (
        db.query(Expense)
        .filter(Expense.id == parsed_id, Expense.user_email == user_id, Expense.group_id.is_(None))
        .first()
    )
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.get(
    "/expenses/{expense_id}/items",
    response_model=ItemsResponse,
    tags=["Expenses"],
    summary="Get line items for an itemized expense",
)
def get_expense_items(
    expense_id: str,
    db: Session = Depends(get_db),
    repo: PostgresRepo = Depends(get_postgres_repo),
    user_id: str = Depends(auth_required),
):
    expense = _get_owned_personal_expense(db, expense_id, user_id)
    items = repo.get_items_for_expense(expense_id)
    return {
        "items": items,
        "amount": float(expense.amount or 0),
        "tax": float(expense.tax or 0),
        "discount": float(expense.discount or 0),
    }


@router.put(
    "/expenses/{expense_id}/items",
    response_model=ItemsResponse,
    tags=["Expenses"],
    summary="Replace line items on an already-saved itemized expense",
)
def update_expense_items(
    expense_id: str,
    payload: ItemsUpdateRequest,
    db: Session = Depends(get_db),
    repo: PostgresRepo = Depends(get_postgres_repo),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    user_id: str = Depends(auth_required),
):
    expense = _get_owned_personal_expense(db, expense_id, user_id)
    items = [i.dict(exclude_unset=True) for i in payload.items]
    if not items:
        raise HTTPException(status_code=400, detail="At least one item is required")
    for item in items:
        if "item_name" not in item or "line_total" not in item:
            raise HTTPException(status_code=400, detail="Invalid item")
    subtotal = sum(((i.get("line_total") or Decimal("0")) for i in items), Decimal("0"))
    if abs(subtotal + payload.tax - payload.discount - payload.amount) > Decimal("0.02"):
        raise HTTPException(status_code=400, detail="Totals do not reconcile")

    repo.delete_items_for_expense(expense_id)
    expense.amount = payload.amount
    expense.tax = payload.tax
    expense.discount = payload.discount
    db.add(expense)
    repo.append_items(user_id, expense_id, items)
    analysis_service.invalidate_cache()

    return {
        "items": repo.get_items_for_expense(expense_id),
        "amount": float(expense.amount or 0),
        "tax": float(expense.tax or 0),
        "discount": float(expense.discount or 0),
    }


@router.get(
    "/models",
    response_model=ModelListResponse,
    tags=["Models"],
    summary="List available LLM models",
)
def list_models():
    """Return provider and available model ids based on environment."""
    models_list = []
    
    # Try to load Gemini models
    try:
        gemini_models = list_gemini_models()
        for m in gemini_models:
            models_list.append({"provider": "gemini", "id": m, "name": f"Gemini: {m}"})
    except Exception:
        pass

    # Try to load OpenAI models
    try:
        openai_models = list_openai_models()
        for m in openai_models:
            models_list.append({"provider": "openai", "id": m, "name": f"OpenAI: {m}"})
    except Exception:
        pass
    
    # Try to load Ollama models
    try:
        ollama_models = list_ollama_models()
        for m in ollama_models:
            models_list.append({"provider": "ollama", "id": m, "name": f"Ollama: {m}"})
    except Exception:
        pass

    return {"models": models_list}


# ---------------------- Recurring ---------------------- #

@router.get(
    "/recurring/templates",
    response_model=list[RecurringTemplateDTO],
    tags=["Recurring"],
    summary="List recurring templates for the authenticated user",
)
def list_recurring_templates(
    svc: RecurringService = Depends(get_recurring_service),
    user_id: str = Depends(auth_required),
):
    return svc.list_templates(user_id)


@router.post(
    "/recurring/upsert",
    response_model=RecurringTemplateDTO,
    tags=["Recurring"],
    summary="Create or update a recurring template",
)
def upsert_recurring_template(
    data: UpsertRecurringTemplateRequest,
    svc: RecurringService = Depends(get_recurring_service),
    user_id: str = Depends(auth_required),
):
    return svc.upsert_template(
        user_id=user_id,
        description=data.description,
        category=data.category,
        merchant_name=data.merchant_name,
        day_of_month=int(data.day_of_month),
        default_cost=float(data.default_cost),
        start_date_iso=data.start_date_iso,
        status=data.status,
        group_id=data.group_id,
        split_config=data.split_config.model_dump() if data.split_config else None,
    )

@router.get(
    "/recurring/due",
    response_model=list[DueOccurrenceDTO],
    tags=["Recurring"],
    summary="Get due recurring occurrences up to as_of date (excludes months already added)",
)
def get_recurring_due(
    as_of: str | None = None,
    svc: RecurringService = Depends(get_recurring_service),
    expense_service: ExpenseService = Depends(get_expense_service),
    user_id: str = Depends(auth_required),
):
    # Compute due months from templates
    due = svc.compute_due(user_id=user_id, as_of_iso=as_of)
    # Build set of (yyyy-mm, desc, category) that already exist in expenses
    existing = expense_service.get_expenses_for_user(user_id)
    existing_keys: set[str] = set()
    from datetime import datetime as _dt
    for e in existing:
        try:
            d = _dt.strptime(e["date"], "%m/%d/%Y")
            existing_keys.add(f"{d.strftime('%Y-%m')}__{e.get('description')}__{e.get('category')}")
        except Exception:
            continue
    # Filter out due entries that already exist for that month
    filtered: list[dict] = []
    for d in due:
        try:
            dt = _dt.strptime(d["date_iso"], "%Y-%m-%d")
            key = f"{dt.strftime('%Y-%m')}__{d.get('description')}__{d.get('category')}"
            if key in existing_keys:
                continue
            filtered.append(d)
        except Exception:
            filtered.append(d)
    return filtered


@router.post(
    "/recurring/confirm",
    response_model=dict,
    tags=["Recurring"],
    summary="Confirm due recurring occurrences and create expenses",
)
def confirm_recurring(
    payload: ConfirmRecurringRequest,
    background_tasks: BackgroundTasks,
    svc: RecurringService = Depends(get_recurring_service),
    expense_service: ExpenseService = Depends(get_expense_service),
    group_expense_service: GroupExpenseService = Depends(get_group_expense_service),
    notification_service: NotificationService = Depends(get_notification_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    db: Session = Depends(get_db),
    user_id: str = Depends(auth_required),
):
    # Reload due occurrences to map template data
    due_list = svc.compute_due(user_id)
    due_map = {f"{d['template_id']}__{d['date_iso']}": d for d in due_list}
    # Build idempotency set from existing expenses for this user
    from varavu_selavu_service.db.models import Expense
    existing_rows = db.query(Expense).filter(Expense.user_email == user_id).all()
    existing_keys = set()
    from datetime import datetime as _dt
    for e in existing_rows:
        date_str = e.purchased_at.strftime("%m/%d/%Y") if e.purchased_at else "01/01/1970"
        key = f"{date_str}__{e.description or ''}__{e.category_id or ''}"
        existing_keys.add(key)

    def iso_to_mmddyyyy(iso: str) -> str:
        try:
            return _dt.strptime(iso, "%Y-%m-%d").strftime("%m/%d/%Y")
        except Exception:
            return iso

    processed: list[dict] = []
    for it in (payload.items or []):
        key = f"{it.get('template_id')}__{it.get('date_iso')}"
        d = due_map.get(key)
        if not d:
            continue
        date_mmdd = iso_to_mmddyyyy(str(it.get('date_iso')))
        dup_key = f"{date_mmdd}__{d['description']}__{d['category']}"
        if dup_key in existing_keys:
            # Already added — skip adding but still mark processed
            processed.append({"template_id": d['template_id'], "date_iso": d['date_iso']})
            continue
        try:
            cost = float(it.get('cost', d.get('suggested_cost', 0)))
        except Exception:
            cost = d.get('suggested_cost', 0)  # type: ignore
        if cost <= 0:
            continue
            
        group_id = d.get('group_id')
        if group_id:
            split_config = d.get('split_config') or {"type": "equal", "entries": []}
            try:
                import uuid
                from varavu_selavu_service.db.models import GroupMember
                members = db.query(GroupMember).filter(GroupMember.group_id == uuid.UUID(str(group_id)), GroupMember.status == "active").all()
                member = next((m for m in members if m.user_email == user_id), None)
                if not member:
                    raise Exception("User is not a member of the group")
                    
                payers = [{"member_id": str(member.id), "amount_paid": cost}]
                
                split_entries = split_config.get("entries", [])
                if not split_entries and split_config.get("type") == "equal":
                    split_entries = [{"member_id": str(m.id), "amount": 0.0} for m in members]
                
                # group_expense_service._parse_date expects MM/DD/YYYY
                date_iso_str = str(it.get('date_iso'))
                formatted_date = datetime.strptime(date_iso_str, "%Y-%m-%d").strftime("%m/%d/%Y")
                
                row = group_expense_service.create_expense(
                    group_id=group_id,
                    actor_email=user_id,
                    date=formatted_date,
                    description=d['description'],
                    category=d['category'],
                    amount=cost,
                    merchant_name=d.get('merchant_name'),
                    payers=payers,
                    split_type=split_config.get("type", "equal"),
                    split_entries=split_entries,
                )
                analysis_service.invalidate_cache()
                
                eid = row.get("row_id")
                if eid:
                    shares = {
                        str(s.member_id): float(s.amount_owed)
                        for s in db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == eid).all()
                    }
                    background_tasks.add_task(
                        notification_service.fan_out,
                        event_type="expense_added",
                        group_id=group_id,
                        actor_email=user_id,
                        expense_description=d['description'],
                        expense_amount=cost,
                        shares=shares,
                    )
            except Exception as e:
                # If group is archived/deleted or other validation fails, skip.
                import logging
                logging.warning(f"Failed to confirm group recurring expense for template {d['template_id']}: {e}")
                continue
        else:
            expense_service.add_expense(
                user_id=user_id,
                date=str(it.get('date_iso')),
                description=d['description'],
                category=d['category'],
                cost=cost,
                merchant_name=d.get('merchant_name'),
            )
            
        existing_keys.add(dup_key)
        processed.append({"template_id": d['template_id'], "date_iso": d['date_iso']})
    if processed:
        svc.mark_processed(user_id, processed)
    return {"success": True, "processed": len(processed)}

@router.post(
    "/recurring/execute_now",
    response_model=dict,
    tags=["Recurring"],
    summary="Execute a template for the current month immediately and mark processed",
)
def execute_recurring_now(
    payload: dict,
    background_tasks: BackgroundTasks,
    svc: RecurringService = Depends(get_recurring_service),
    expense_service: ExpenseService = Depends(get_expense_service),
    group_expense_service: GroupExpenseService = Depends(get_group_expense_service),
    notification_service: NotificationService = Depends(get_notification_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    db: Session = Depends(get_db),
    user_id: str = Depends(auth_required),
):
    from datetime import datetime as _dt
    template_id: str = str(payload.get("template_id"))
    if not template_id:
        return {"success": False, "created": False, "error": "template_id required"}
    cost = payload.get("cost")
    try:
        cost = float(cost) if cost is not None else None
    except Exception:
        cost = None
    # Find template
    tpls = svc.list_templates(user_id)
    tpl = next((t for t in tpls if t.get("id") == template_id), None)
    if not tpl:
        return {"success": False, "created": False, "error": "template not found"}

    now = _dt.utcnow()
    y, m0 = now.year, now.month - 1
    # scheduled date within this month (clamped)
    def _last_day_of_month(y: int, m0: int) -> int:
        from datetime import datetime, timedelta
        first_next = datetime(y + (1 if m0 == 11 else 0), (m0 + 1) % 12 + 1, 1)
        return (first_next - timedelta(days=1)).day

    dom = min(int(tpl["day_of_month"]), _last_day_of_month(y, m0))
    scheduled_iso = _dt(y, m0 + 1, dom).strftime("%Y-%m-%d")
    expense_date_iso = payload.get("date_iso") or _dt.utcnow().strftime("%Y-%m-%d")
    use_cost = cost if cost is not None else float(tpl.get("default_cost", 0))
    if use_cost <= 0:
        return {"success": False, "created": False, "error": "invalid cost"}

    # Idempotency: if an expense exists in this month with same description+category, skip creating
    existing = expense_service.get_expenses_for_user(user_id)
    # month key YYYY-MM
    month_key = f"{y}-{str(m0+1).zfill(2)}"
    already = False
    for e in existing:
        try:
            # e["date"] could be YYYY-MM-DD or MM/DD/YYYY based on the load
            d_str = e.get("date", "")
            if not d_str:
                continue
            if len(d_str) > 10:
                d_str = d_str[:10]
                
            try:
                d = _dt.strptime(d_str, "%Y-%m-%d")
            except ValueError:
                d = _dt.strptime(d_str, "%m/%d/%Y")

            if d.strftime("%Y-%m") == month_key and e.get("description") == tpl["description"] and e.get("category") == tpl["category"]:
                already = True
                break
        except Exception:
            continue

    created = False
    if not already:
        group_id = tpl.get("group_id")
        if group_id:
            split_config = tpl.get("split_config") or {"type": "equal", "entries": []}
            try:
                import uuid
                from varavu_selavu_service.db.models import GroupMember
                members = db.query(GroupMember).filter(GroupMember.group_id == uuid.UUID(str(group_id)), GroupMember.status == "active").all()
                member = next((m for m in members if m.user_email == user_id), None)
                if not member:
                    raise Exception("User is not a member of the group")
                    
                payers = [{"member_id": str(member.id), "amount_paid": use_cost}]
                
                split_entries = split_config.get("entries", [])
                if not split_entries and split_config.get("type") == "equal":
                    split_entries = [{"member_id": str(m.id), "amount": 0.0} for m in members]
                    
                # group_expense_service._parse_date expects MM/DD/YYYY
                formatted_date = _dt.strptime(expense_date_iso, "%Y-%m-%d").strftime("%m/%d/%Y")
                    
                row = group_expense_service.create_expense(
                    group_id=group_id,
                    actor_email=user_id,
                    date=formatted_date,
                    description=tpl.get("description"),
                    category=tpl.get("category"),
                    amount=use_cost,
                    merchant_name=tpl.get("merchant_name"),
                    payers=payers,
                    split_type=split_config.get("type", "equal"),
                    split_entries=split_entries,
                )
                analysis_service.invalidate_cache()
                
                eid = row.get("row_id")
                if eid:
                    shares = {
                        str(s.member_id): float(s.amount_owed)
                        for s in db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == eid).all()
                    }
                    background_tasks.add_task(
                        notification_service.fan_out,
                        event_type="expense_added",
                        group_id=group_id,
                        actor_email=user_id,
                        expense_description=tpl['description'],
                        expense_amount=use_cost,
                        shares=shares,
                    )
                created = True
            except Exception as e:
                import logging
                logging.warning(f"Failed to execute group recurring expense for template {template_id}: {e}")
        else:
            expense_service.add_expense(
                user_id=user_id,
                date=expense_date_iso,
                description=tpl["description"],
                category=tpl["category"],
                cost=use_cost,
                merchant_name=tpl.get("merchant_name"),
            )
            created = True

    # Mark current month as processed so auto prompt won't add later
    svc.mark_processed(user_id, [{"template_id": tpl["id"], "date_iso": scheduled_iso}])
    return {"success": True, "created": created, "processed_date": scheduled_iso}

@router.delete(
    "/recurring/templates/{template_id}",
    response_model=dict,
    tags=["Recurring"],
    summary="Delete a recurring template",
)
def delete_recurring_template(
    template_id: str,
    svc: RecurringService = Depends(get_recurring_service),
    user_id: str = Depends(auth_required),
):
    ok = svc.delete_template(user_id, template_id)
    return {"success": bool(ok)}


# ---------------------- Budgets (TS-BUD-101) ---------------------- #

@router.get(
    "/budgets",
    response_model=list[BudgetDTO],
    tags=["Budgets"],
    summary="List budgets with live spent/committed/remaining/projected/status",
)
def list_budgets(
    scope: str | None = Query(None, description="personal | combined"),
    period: str | None = Query(None, description="YYYY-MM, defaults to the current month"),
    svc: BudgetService = Depends(get_budget_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_budgets_enabled),
):
    return svc.list_budgets(user_id, scope=scope, period_str=period)


@router.post(
    "/budgets",
    response_model=BudgetDTO,
    tags=["Budgets"],
    summary="Create a budget, or edit the existing one for the same (scope, category) — FR-2",
)
def create_budget(
    data: CreateBudgetRequest,
    svc: BudgetService = Depends(get_budget_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_budgets_enabled),
):
    return svc.create_or_update(user_id, data)


@router.patch(
    "/budgets/{budget_id}",
    response_model=BudgetDTO,
    tags=["Budgets"],
    summary="Update a budget's amount/rollover/thresholds/mute",
)
def update_budget(
    budget_id: str,
    data: UpdateBudgetRequest,
    svc: BudgetService = Depends(get_budget_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_budgets_enabled),
):
    return svc.update_budget(user_id, budget_id, data)


@router.delete(
    "/budgets/{budget_id}",
    response_model=dict,
    tags=["Budgets"],
    summary="Delete a budget (soft — past-period snapshots are retained, FR-8)",
)
def delete_budget(
    budget_id: str,
    svc: BudgetService = Depends(get_budget_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_budgets_enabled),
):
    svc.delete_budget(user_id, budget_id)
    return {"success": True}


@router.get(
    "/budgets/{budget_id}/breakdown",
    response_model=BudgetBreakdownResponse,
    tags=["Budgets"],
    summary="Contributing transactions for a budget's period — feeds \"Ask why\"",
)
def get_budget_breakdown(
    budget_id: str,
    period: str | None = Query(None, description="YYYY-MM, defaults to the current month"),
    svc: BudgetService = Depends(get_budget_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_budgets_enabled),
):
    return svc.get_breakdown(user_id, budget_id, period_str=period)


@router.get(
    "/budgets/suggestions",
    response_model=list[BudgetSuggestion],
    tags=["Budgets"],
    summary="Median-of-last-3-months suggested budget amounts per category",
)
def get_budget_suggestions(
    scope: str = Query("personal", description="personal | combined"),
    svc: BudgetService = Depends(get_budget_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_budgets_enabled),
):
    return svc.get_suggestions(user_id, scope=scope)


@router.post(
    "/budgets/{budget_id}/ask-why",
    response_model=BudgetAskWhyResponse,
    tags=["Budgets"],
    summary="AI explanation of a budget's status, grounded in its contributing transactions",
)
@limiter.limit("5/minute")
def budget_ask_why(
    request: Request,
    budget_id: str,
    period: str | None = Query(None, description="YYYY-MM, defaults to the current month"),
    svc: BudgetService = Depends(get_budget_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    insight_service: InsightAnalyticsService = Depends(get_insight_analytics_service),
    group_service: GroupService = Depends(get_group_service),
    balance_service: BalanceService = Depends(get_balance_service),
    expense_service: ExpenseService = Depends(get_expense_service),
    group_expense_service: GroupExpenseService = Depends(get_group_expense_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_budgets_enabled),
):
    """§5.4 — hands the model the budget's live figures and every contributing transaction
    (via BudgetService.get_breakdown/build_ask_why_prompt) instead of just deep-linking to the
    general chat surface, then reuses the same call_chat_model dispatch /analysis/chat uses."""
    breakdown = svc.get_breakdown(user_id, budget_id, period_str=period)
    query_text = svc.build_ask_why_prompt(breakdown)
    try:
        result = call_chat_model(
            messages=[{"role": "user", "content": query_text}],
            user_id=user_id,
            analysis_service=analysis_service,
            analytics_service=analytics_service,
            insight_service=insight_service,
            group_service=group_service,
            balance_service=balance_service,
            expense_service=expense_service,
            group_expense_service=group_expense_service,
            groups_enabled=settings.GROUPS_ENABLED,
        )
        return {"response": result.response}
    except HTTPException:
        raise
    except Exception as exc:
        import logging
        logging.getLogger("varavu_selavu.routes").exception("Budget ask-why failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="The AI analyst is temporarily unavailable. Please try again later."
        )


# ---------------------- Email ---------------------- #

@router.post(
    "/email/send",
    response_model=SendEmailResponse,
    tags=["Email"],
    summary="Send a generic email (feature request, contact us, etc.)",
)
@limiter.limit("5/minute")
def send_email_route(
    request: Request,
    data: SendEmailRequest,
):
    from varavu_selavu_service.services.email_service import send_email
    try:
        send_email(
            form_type=data.form_type,
            user_email=data.user_email,
            subject=data.subject,
            message_body=data.message_body,
            name=data.name,
        )
        return {"success": True, "message": "Email sent successfully"}
    except Exception as exc:
        import logging
        logging.getLogger("varavu_selavu_service.api.routes").error(f"Error in send_email_route: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to send email: {exc}")
