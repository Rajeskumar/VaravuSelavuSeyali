from fastapi import APIRouter, Response, Depends, status, Query, File, UploadFile, HTTPException, BackgroundTasks, Request
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

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
    CardCatalogSummary,
    CardCatalogDetail,
    CardEarningRuleDTO,
    UserCardDTO,
    AddUserCardRequest,
    CardCoachResponse,
    CardCoachPeriod,
    CardCoachCategoryDTO,
    CardCoachMerchantDTO,
    CardCoachFilterInfo,
    CardCorrectionRequest,
    CardCorrectionDTO,
    CreateCustomCardRequest,
    TagCreateRequest,
    TagUpdateRequest,
    TagDTO,
    TagRefDTO,
    TagApplyRequest,
    TagBulkRequest,
    TagBulkResponse,
)
from varavu_selavu_service.services.budget_service import BudgetService
from varavu_selavu_service.services.card_service import CardService, get_card_refs_for_expenses
from varavu_selavu_service.services.tag_service import TagService, get_tags_for_expenses
from varavu_selavu_service.services.tag_bulk_service import TagBulkService, BulkFilter
from varavu_selavu_service.services.card_rewards_engine import CategoryRewardGap, MerchantRewardGap
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

def get_card_service(db: Session = Depends(get_db)) -> CardService:
    return CardService(db)

def require_card_coach_enabled() -> None:
    if not Settings().CARD_COACH_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

def get_tag_service(db: Session = Depends(get_db)) -> TagService:
    return TagService(db)

def require_tags_enabled() -> None:
    if not Settings().TAGS_ENABLED:
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
        "card_coach_enabled": settings_now.CARD_COACH_ENABLED,
        "tags_enabled": settings_now.TAGS_ENABLED,
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
    tag_service: TagService = Depends(get_tag_service),
    card_service: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
):
    # TS-CARD-114: must be one of the caller's own held cards — never an arbitrary catalog id.
    if data.card_id:
        card_service.assert_card_is_held(user_id, data.card_id)
    saved = expense_service.add_expense(
        user_id=user_id,
        date=data.date,
        description=data.description,
        category=data.category,
        cost=data.cost,
        merchant_name=data.merchant_name,
        card_id=data.card_id,
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

    # TS-TAG-104 — no prior state on create, so a None/omitted vs. empty tag_names distinction
    # doesn't matter here (both mean "no tags"); only skip the call entirely when there's nothing
    # to apply, since apply_tags_to_expense 422s on an empty tag set.
    tags = tag_service.apply_tags_to_expense(user_id, saved["row_id"], tag_names=data.tag_names) if data.tag_names else []
    card = None
    if data.card_id:
        cid = _uuid.UUID(data.card_id)
        card = get_card_refs_for_expenses(expense_service.db, [cid]).get(str(cid))

    # Normalize to response model shape
    expense_payload = {
        "user_id": saved.get("User ID", user_id),
        "date": data.date,
        "description": saved.get("description", data.description),
        "category": saved.get("category", data.category),
        "cost": float(saved.get("cost", data.cost)),
        "merchant_name": saved.get("merchant_name"),
        "tags": tags,
        "card": card,
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
    tag_ids: List[str] | None = Query(default=None),
    expense_service: ExpenseService = Depends(get_expense_service),
    user_id: str = Depends(auth_required),
):
    expenses = expense_service.get_expenses_for_user(user_id)
    # TS-TAG-106 (PRD §10.4/§7.4) — OR semantics within tag_ids, AND against other active
    # filters. `tags` is always already scoped to this user (get_tags_for_expenses, PRD §9.2),
    # so this is a plain in-memory filter, not a fresh access check.
    if tag_ids and Settings().TAGS_ENABLED:
        wanted = set(tag_ids)
        expenses = [e for e in expenses if wanted & {t["id"] for t in e.get("tags", [])}]
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
    tag_service: TagService = Depends(get_tag_service),
    card_service: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
):
    if data.card_id:
        card_service.assert_card_is_held(user_id, data.card_id)
    saved, old_data = expense_service.update_expense(
        row_id=row_id,
        user_id=user_id,
        date=data.date,
        description=data.description,
        category=data.category,
        cost=data.cost,
        merchant_name=data.merchant_name,
        card_id=data.card_id,
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

    # TS-TAG-104 — full-replace, but ONLY when the client explicitly sent the field (PRD §10.2:
    # "an omitted field leaves tags unchanged; an explicit empty array clears them").
    if "tag_names" in data.model_fields_set:
        tags = tag_service.set_tags_for_expense(user_id, saved["row_id"], data.tag_names or [])
    else:
        eid = _uuid.UUID(saved["row_id"])
        tags = get_tags_for_expenses(tag_service.db, [eid], user_id).get(str(eid), [])

    card = None
    if data.card_id:
        cid = _uuid.UUID(data.card_id)
        card = get_card_refs_for_expenses(expense_service.db, [cid]).get(str(cid))

    expense_payload = {
        "user_id": saved.get("User ID", user_id),
        "date": data.date,
        "description": saved.get("description", data.description),
        "category": saved.get("category", data.category),
        "cost": float(saved.get("cost", data.cost)),
        "merchant_name": saved.get("merchant_name"),
        "tags": tags,
        "card": card,
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
    tag_ids: List[str] | None = Query(default=None),
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
    if not Settings().TAGS_ENABLED:
        tag_ids = None
    result = analysis_service.analyze(
        user_id=user_id,
        year=year,
        month=month,
        start_date=start_date,
        end_date=end_date,
        use_cache=True,
        scope=scope,
        group_id=group_id,
        tag_ids=tag_ids,
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
    card_service: CardService = Depends(get_card_service),
    tag_service: TagService = Depends(get_tag_service),
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
            card_service=card_service,
            card_coach_enabled=Settings().CARD_COACH_ENABLED,
            tag_service=tag_service,
            tags_enabled=Settings().TAGS_ENABLED,
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
    tag_service: TagService = Depends(get_tag_service),
    card_service: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    force: bool = Query(False),
):
    if payload.card_id:
        card_service.assert_card_is_held(user_id, payload.card_id)
    header = {**payload.header, "card_id": payload.card_id} if payload.card_id else payload.header
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

    # TS-TAG-104 — same "nothing to apply" guard as create_expense (no prior state on create).
    if payload.tag_names:
        tag_service.apply_tags_to_expense(user_id, expense_id, tag_names=payload.tag_names)

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


# ---------------------- Card Coach (TS-CARD-103) ---------------------- #

def _earning_rule_to_dto(rule) -> CardEarningRuleDTO:
    return CardEarningRuleDTO(
        id=str(rule.id),
        category_id=rule.category_id,
        merchant_name=rule.merchant_name,
        multiplier=float(rule.multiplier),
        cap_amount=float(rule.cap_amount) if rule.cap_amount is not None else None,
        cap_period=rule.cap_period,
        exclusions_note=rule.exclusions_note,
        rotation_start=rule.rotation_start.isoformat() if rule.rotation_start else None,
        rotation_end=rule.rotation_end.isoformat() if rule.rotation_end else None,
    )


def _user_card_to_dto(user_card, catalog_card) -> UserCardDTO:
    return UserCardDTO(
        id=str(user_card.id),
        card_id=str(catalog_card.id),
        issuer=catalog_card.issuer,
        card_name=catalog_card.card_name,
        reward_type=catalog_card.reward_type,
        is_default=user_card.is_default,
        is_custom=catalog_card.created_by_user_email is not None,
        added_at=user_card.added_at.isoformat(),
    )


@router.get(
    "/cards/catalog",
    response_model=list[CardCatalogSummary],
    tags=["Card Coach"],
    summary="Search the curated card catalog by issuer/name",
)
def search_card_catalog(
    q: str | None = Query(None, description="Free-text issuer/card-name search"),
    svc: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_card_coach_enabled),
):
    cards = svc.search_catalog(user_id, query=q)
    return [
        CardCatalogSummary(
            id=str(c.id), issuer=c.issuer, card_name=c.card_name, reward_type=c.reward_type,
            annual_fee=float(c.annual_fee), is_custom=c.created_by_user_email is not None,
        )
        for c in cards
    ]


@router.get(
    "/cards/catalog/{card_id}",
    response_model=CardCatalogDetail,
    tags=["Card Coach"],
    summary="Full detail for one catalog card, including earning rules and provenance",
)
def get_card_catalog_detail(
    card_id: str,
    svc: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_card_coach_enabled),
):
    card = svc.get_catalog_detail(card_id, require_visible_to=user_id)
    rules = svc.get_earning_rules(card_id)
    return CardCatalogDetail(
        id=str(card.id),
        issuer=card.issuer,
        card_name=card.card_name,
        reward_type=card.reward_type,
        points_currency_name=card.points_currency_name,
        point_value_estimate_usd=float(card.point_value_estimate_usd) if card.point_value_estimate_usd is not None else None,
        annual_fee=float(card.annual_fee),
        earning_rules=[_earning_rule_to_dto(r) for r in rules],
        source_url=card.source_url,
        last_verified_at=card.last_verified_at.isoformat() if card.last_verified_at else None,
        is_active=card.is_active,
        is_custom=card.created_by_user_email is not None,
    )


@router.get(
    "/cards/mine",
    response_model=list[UserCardDTO],
    tags=["Card Coach"],
    summary="List the current user's held cards",
)
def list_my_cards(
    svc: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_card_coach_enabled),
):
    rows = svc.list_user_cards(user_id)
    return [_user_card_to_dto(user_card, catalog_card) for user_card, catalog_card in rows]


@router.post(
    "/cards/mine",
    response_model=UserCardDTO,
    status_code=status.HTTP_201_CREATED,
    tags=["Card Coach"],
    summary="Add a held card",
)
def add_my_card(
    data: AddUserCardRequest,
    svc: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_card_coach_enabled),
):
    user_card = svc.add_user_card(user_id, data.card_id)
    catalog_card = svc.get_catalog_detail(str(user_card.card_id))
    return _user_card_to_dto(user_card, catalog_card)


@router.delete(
    "/cards/mine/{user_card_id}",
    response_model=dict,
    tags=["Card Coach"],
    summary="Remove a held card",
)
def remove_my_card(
    user_card_id: str,
    svc: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_card_coach_enabled),
):
    svc.remove_user_card(user_id, user_card_id)
    return {"success": True}


@router.post(
    "/cards/mine/{user_card_id}/set_default",
    response_model=UserCardDTO,
    tags=["Card Coach"],
    summary="Mark a held card as the default used for CardRewardsEngine's actual-earned figure",
)
def set_my_default_card(
    user_card_id: str,
    svc: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_card_coach_enabled),
):
    user_card = svc.set_default_card(user_id, user_card_id)
    catalog_card = svc.get_catalog_detail(str(user_card.card_id))
    return _user_card_to_dto(user_card, catalog_card)


@router.post(
    "/cards/custom",
    response_model=UserCardDTO,
    status_code=status.HTTP_201_CREATED,
    tags=["Card Coach"],
    summary="Add a user-created custom card (outside the curated catalog) and hold it in one call",
)
def create_custom_card(
    data: CreateCustomCardRequest,
    svc: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_card_coach_enabled),
):
    card, user_card = svc.create_custom_card(
        user_id, card_name=data.card_name, issuer=data.issuer, annual_fee=float(data.annual_fee),
        rules=[{"category_id": r.category_id, "multiplier": r.multiplier} for r in data.rules],
    )
    return _user_card_to_dto(user_card, card)


def _cap_note_for(gap) -> str | None:
    # Prefer the catalog-optimal card's cap note (the aspirational suggestion, spec Appendix
    # example) — fall back to the in-wallet-optimal card's note if the catalog has none.
    if gap.optimal_catalog and gap.optimal_catalog.cap_note:
        return gap.optimal_catalog.cap_note
    if gap.optimal_in_wallet and gap.optimal_in_wallet.cap_note:
        return gap.optimal_in_wallet.cap_note
    return None


def _is_using_best_held_card(gap) -> bool:
    """Phase 2 'better card' nudge: compares by card_id, not display name — two different cards
    (e.g. a custom card and a catalog card) can share a card_name. Defaults True (no nudge) when
    there's nothing to compare, same "never fabricate" rule as gap_usd."""
    if not gap.actual or not gap.optimal_in_wallet:
        return True
    return gap.actual.card_id == gap.optimal_in_wallet.card_id


def _gap_to_dto(gap: CategoryRewardGap) -> CardCoachCategoryDTO:
    return CardCoachCategoryDTO(
        category=gap.category,
        actual_spend=gap.actual_spend,
        spend_source="",  # filled in by the caller — same value for every row in one response
        actual_earned_estimate=gap.actual.earned_usd if gap.actual else None,
        held_card_used=gap.actual.card_name if gap.actual else None,
        optimal_in_wallet_card=gap.optimal_in_wallet.card_name if gap.optimal_in_wallet else None,
        optimal_in_wallet_earned_estimate=gap.optimal_in_wallet.earned_usd if gap.optimal_in_wallet else None,
        optimal_catalog_card=gap.optimal_catalog.card_name if gap.optimal_catalog else None,
        optimal_catalog_earned_estimate=gap.optimal_catalog.earned_usd if gap.optimal_catalog else None,
        cap_note=_cap_note_for(gap),
        is_using_best_held_card=_is_using_best_held_card(gap),
    )


def _merchant_gap_to_dto(gap: MerchantRewardGap) -> CardCoachMerchantDTO:
    return CardCoachMerchantDTO(
        merchant=gap.merchant,
        actual_spend=gap.actual_spend,
        spend_source="",  # filled in by the caller — same value for every row in one response
        actual_earned_estimate=gap.actual.earned_usd if gap.actual else None,
        held_card_used=gap.actual.card_name if gap.actual else None,
        optimal_in_wallet_card=gap.optimal_in_wallet.card_name if gap.optimal_in_wallet else None,
        optimal_in_wallet_earned_estimate=gap.optimal_in_wallet.earned_usd if gap.optimal_in_wallet else None,
        optimal_catalog_card=gap.optimal_catalog.card_name if gap.optimal_catalog else None,
        optimal_catalog_earned_estimate=gap.optimal_catalog.earned_usd if gap.optimal_catalog else None,
        cap_note=_cap_note_for(gap),
        is_using_best_held_card=_is_using_best_held_card(gap),
    )


@router.get(
    "/cards/coach",
    response_model=CardCoachResponse,
    tags=["Card Coach"],
    summary="Card Coach analysis: per-category and per-merchant actual vs. optimal reward estimate for the given period",
)
def get_card_coach(
    year: int | None = Query(default=None, ge=1970, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    start_date: str | None = None,
    end_date: str | None = None,
    card_service: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_card_coach_enabled),
):
    # Same GROUPS_ENABLED gate as the plain /analysis route — group data must not leak through
    # here if Groups itself is off, regardless of what a client requests.
    category_gaps, merchant_gaps, group_share_included = card_service.compute_coach_gaps(
        user_id, year=year, month=month, start_date=start_date, end_date=end_date,
        groups_enabled=Settings().GROUPS_ENABLED,
    )

    spend_source = "personal_plus_group_paid" if group_share_included else "personal_only"
    by_category = []
    for gap in category_gaps:
        dto = _gap_to_dto(gap)
        dto.spend_source = spend_source
        by_category.append(dto)

    by_merchant = []
    for gap in merchant_gaps:
        dto = _merchant_gap_to_dto(gap)
        dto.spend_source = spend_source
        by_merchant.append(dto)

    # Deliberately category-only (spec discussion, Option B) — merchant gaps are a supplementary,
    # precedence-correct view, never summed into the headline number, since a merchant's spend is
    # already included in its category's own gap and summing both would double-count it.
    total_gap = round(sum(g.gap_usd for g in category_gaps), 2)

    return CardCoachResponse(
        period=CardCoachPeriod(year=year, month=month),
        total_estimated_gap=total_gap,
        by_category=by_category,
        by_merchant=by_merchant,
        filter_info=CardCoachFilterInfo(year=year, month=month, group_share_included=group_share_included),
    )


@router.post(
    "/cards/corrections",
    response_model=CardCorrectionDTO,
    status_code=status.HTTP_201_CREATED,
    tags=["Card Coach"],
    summary="File a data-correction report against a catalog card",
)
def file_card_correction(
    data: CardCorrectionRequest,
    card_service: CardService = Depends(get_card_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_card_coach_enabled),
):
    correction = card_service.file_correction(user_id, data.card_id, data.note)
    return CardCorrectionDTO(
        id=str(correction.id),
        card_id=str(correction.card_id),
        note=correction.note,
        status=correction.status,
        created_at=correction.created_at.isoformat(),
    )


# ---------------------- Tags (TS-TAG-102) ---------------------- #

def _tag_to_dto(stats) -> TagDTO:
    return TagDTO(
        id=str(stats.tag.id),
        name=stats.tag.name,
        color=stats.tag.color,
        status=stats.tag.status,
        created_at=stats.tag.created_at,
        usage_count=stats.usage_count,
        last_used_at=stats.last_used_at,
    )


@router.get(
    "/tags",
    response_model=List[TagDTO],
    tags=["Tags"],
    summary="List / autocomplete the caller's own tags, ranked most-recently-used then most-used",
)
def list_tags(
    q: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default="active"),
    limit: int = Query(default=20, ge=1, le=100),
    tag_service: TagService = Depends(get_tag_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_tags_enabled),
):
    return [_tag_to_dto(s) for s in tag_service.list_tags(user_id, q=q, status_filter=status, limit=limit)]


@router.post(
    "/tags",
    response_model=TagDTO,
    tags=["Tags"],
    summary="Create a tag — returns the existing tag (HTTP 200) on an exact-normalized-name collision",
)
def create_tag(
    data: TagCreateRequest,
    response: Response,
    tag_service: TagService = Depends(get_tag_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_tags_enabled),
):
    tag, created = tag_service.create_tag(user_id, data.name, color=data.color)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return _tag_to_dto(tag_service.get_stats(tag))


@router.put(
    "/tags/{tag_id}",
    response_model=TagDTO,
    tags=["Tags"],
    summary="Rename, recolor, or archive/unarchive a tag",
)
def update_tag(
    tag_id: str,
    data: TagUpdateRequest,
    tag_service: TagService = Depends(get_tag_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_tags_enabled),
):
    tag = tag_service.update_tag(user_id, tag_id, name=data.name, color=data.color, status_value=data.status)
    return _tag_to_dto(tag_service.get_stats(tag))


@router.delete(
    "/tags/{tag_id}",
    tags=["Tags"],
    summary="Delete a tag and cascade its expense links",
)
def delete_tag(
    tag_id: str,
    tag_service: TagService = Depends(get_tag_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_tags_enabled),
):
    tag_service.delete_tag(user_id, tag_id)
    return {"success": True}


def _verify_expense_tag_access(db: Session, group_service: GroupService, expense_id: str, user_id: str) -> None:
    """TS-TAG-103 — an expense's tags may only be modified by someone with legitimate access to
    the expense itself: its own owner for a personal expense, or any member for a group expense
    (any member may tag their own private view of a shared expense, same as any member may edit
    a group expense per spec §5.2). 404 (not 403) on a personal expense the caller doesn't own,
    to avoid confirming the expense exists to a non-owner."""
    try:
        eid = _uuid.UUID(str(expense_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Expense not found")
    expense = db.query(Expense).filter(Expense.id == eid).first()
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    if expense.group_id is None:
        if expense.user_email != user_id:
            raise HTTPException(status_code=404, detail="Expense not found")
    else:
        group_service.require_membership(str(expense.group_id), user_id)


@router.post(
    "/expenses/{expense_id}/tags",
    response_model=List[TagRefDTO],
    tags=["Tags"],
    summary="Apply one or more tags to an expense (idempotent)",
)
def apply_tags_to_expense(
    expense_id: str,
    data: TagApplyRequest,
    db: Session = Depends(get_db),
    tag_service: TagService = Depends(get_tag_service),
    group_service: GroupService = Depends(get_group_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_tags_enabled),
):
    _verify_expense_tag_access(db, group_service, expense_id, user_id)
    return tag_service.apply_tags_to_expense(user_id, expense_id, tag_ids=data.tag_ids, tag_names=data.tag_names)


@router.delete(
    "/expenses/{expense_id}/tags/{tag_id}",
    tags=["Tags"],
    summary="Remove one tag from one expense (idempotent)",
)
def remove_tag_from_expense(
    expense_id: str,
    tag_id: str,
    db: Session = Depends(get_db),
    tag_service: TagService = Depends(get_tag_service),
    group_service: GroupService = Depends(get_group_service),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_tags_enabled),
):
    _verify_expense_tag_access(db, group_service, expense_id, user_id)
    tag_service.remove_tag_from_expense(user_id, expense_id, tag_id)
    return {"success": True}


def _to_bulk_filter(dto) -> Optional[BulkFilter]:
    if dto is None:
        return None
    return BulkFilter(
        start_date=dto.start_date, end_date=dto.end_date,
        group_id=dto.group_id, category=dto.category, merchant_name=dto.merchant_name,
    )


@router.post(
    "/tags/bulk_apply",
    response_model=TagBulkResponse,
    tags=["Tags"],
    summary="Apply one tag to many expenses at once — explicit id list or a date-range+narrowing filter (§7.3 'tag a trip')",
)
def bulk_apply_tags(
    data: TagBulkRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_tags_enabled),
):
    result = TagBulkService(db).bulk_apply(
        user_id, tag_id=data.tag_id, tag_name=data.tag_name,
        expense_ids=data.expense_ids, filter_=_to_bulk_filter(data.filter), dry_run=data.dry_run,
    )
    return TagBulkResponse(**result.__dict__)


@router.post(
    "/tags/bulk_remove",
    response_model=TagBulkResponse,
    tags=["Tags"],
    summary="Remove one tag from many expenses at once — same shape as bulk_apply",
)
def bulk_remove_tags(
    data: TagBulkRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(auth_required),
    _: None = Depends(require_tags_enabled),
):
    result = TagBulkService(db).bulk_remove(
        user_id, tag_id=data.tag_id, tag_name=data.tag_name,
        expense_ids=data.expense_ids, filter_=_to_bulk_filter(data.filter), dry_run=data.dry_run,
    )
    return TagBulkResponse(**result.__dict__)


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
