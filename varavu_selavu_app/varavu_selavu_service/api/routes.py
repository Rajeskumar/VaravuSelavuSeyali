from fastapi import APIRouter, Response, Depends, status, Query, File, UploadFile, HTTPException, BackgroundTasks
from datetime import datetime

from varavu_selavu_service.models.api_models import (
    ExpenseRequest,
    ReceiptParseResponse,
    ExpenseWithItemsRequest,
    ExpenseWithItemsResponse,
    CategorizeRequest,
    CategorizeResponse,
    ChatRequest,
    HealthResponse,
    DashboardResponse,
    ExpenseCreatedResponse,
    ExpenseRow,
    AnalysisResponse,
    ChatResponse,
    ModelListResponse,
    ExpenseListResponse,
    ExpenseDeleteResponse,
)
from varavu_selavu_service.services.expense_service import ExpenseService
from varavu_selavu_service.services.receipt_service import ReceiptService
from varavu_selavu_service.repo.postgres_repo import PostgresRepo
from varavu_selavu_service.services.chat_service import (
    call_chat_model,
    list_openai_models,
    list_ollama_models,
)
from varavu_selavu_service.services.analysis_service import AnalysisService
from varavu_selavu_service.services.analytics_service import AnalyticsService
from varavu_selavu_service.services.insights_aggregation_service import InsightsAggregationService
from varavu_selavu_service.services.categorization_service import CategorizationService
from varavu_selavu_service.services.recurring_service import RecurringService
from varavu_selavu_service.core.config import Settings
from sqlalchemy.orm import Session
from varavu_selavu_service.db.session import get_db
from threading import RLock
from varavu_selavu_service.auth.routers import router as auth_router
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.models.api_models import (
    RecurringTemplateDTO,
    UpsertRecurringTemplateRequest,
    DueOccurrenceDTO,
    ConfirmRecurringRequest,
    SendEmailRequest,
    SendEmailResponse,
)

settings = Settings()

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router, prefix="/auth")

# Dependency providers
def get_expense_service(db: Session = Depends(get_db)) -> ExpenseService:
    return ExpenseService(db)
# Simple in-memory cache for analysis results
_ANALYSIS_CACHE: dict[
    tuple[str, int | None, int | None, str | None, str | None],
    tuple[float, dict],
] = {}
_ANALYSIS_CACHE_TTL_SEC = 60  # adjust as needed
_CACHE_LOCK = RLock()

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

def get_analytics_service(db: Session = Depends(get_db)) -> AnalyticsService:
    return AnalyticsService(db=db)

def get_insights_aggregation_service(db: Session = Depends(get_db)) -> InsightsAggregationService:
    return InsightsAggregationService(db=db)

@router.get("/healthz", response_model=HealthResponse, tags=["Health"], summary="Liveness probe")
def health_check():
    return {"status": "healthy"}

@router.get("/readyz", response_model=HealthResponse, tags=["Health"], summary="Readiness probe")
def readiness_check():
    # Extend with checks to downstream services (e.g., Google Sheets) if needed
    return {"status": "healthy"}


@router.post(
    "/expenses/categorize",
    response_model=CategorizeResponse,
    tags=["Expenses"],
    summary="Suggest category and subcategory for a description",
)
def categorize_expense(
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
    _: str = Depends(auth_required),
):
    saved = expense_service.add_expense(
        user_id=data.user_id,
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
        user_email=data.user_id,
        merchant_name=data.merchant_name,
        purchased_at=datetime.strptime(saved["date"], "%m/%d/%Y"),
        amount=data.cost
    )
    
    # Normalize to response model shape
    expense_payload = {
        "user_id": saved.get("User ID", data.user_id),
        "date": data.date,
        "description": saved.get("description", data.description),
        "category": saved.get("category", data.category),
        "cost": float(saved.get("cost", data.cost)),
        "merchant_name": saved.get("merchant_name"),
    }
    return {"success": True, "expense": expense_payload}


@router.get(
    "/expenses",
    response_model=ExpenseListResponse,
    tags=["Expenses"],
    summary="List expenses for a user",
)
def list_expenses(
    user_id: str,
    limit: int = Query(30, ge=1),
    offset: int = Query(0, ge=0),
    expense_service: ExpenseService = Depends(get_expense_service),
    _: str = Depends(auth_required),
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
    _: str = Depends(auth_required),
):
    saved, old_data = expense_service.update_expense(
        row_id=row_id,
        user_id=data.user_id,
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
            user_email=data.user_id,
            old_merchant_name=old_data["merchant_name"],
            old_amount=old_data["amount"],
            old_purchased_at=old_data["purchased_at"],
            new_merchant_name=data.merchant_name,
            new_amount=data.cost,
            new_purchased_at=datetime.strptime(saved["date"], "%m/%d/%Y")
        )
        
    expense_payload = {
        "user_id": saved.get("User ID", data.user_id),
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
    expense_service: ExpenseService = Depends(get_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    _: str = Depends(auth_required),
):
    expense_service.delete_expense(row_id)
    analysis_service.invalidate_cache()
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

@router.get("/analytics/items", tags=["Analytics"], summary="Get top items")
def get_top_items(
    limit: int = Query(20, ge=1),
    svc: AnalyticsService = Depends(get_analytics_service),
    user_id: str = Depends(auth_required),
):
    return svc.get_top_items(user_id, limit)

@router.get("/analytics/items/{item_name}", tags=["Analytics"], summary="Get item details")
def get_item_detail(
    item_name: str,
    svc: AnalyticsService = Depends(get_analytics_service),
    user_id: str = Depends(auth_required),
):
    detail = svc.get_item_detail(user_id, item_name)
    if not detail:
        raise HTTPException(status_code=404, detail="Item not found")
    return detail

@router.get("/analytics/merchants", tags=["Analytics"], summary="Get top merchants")
def get_top_merchants(
    limit: int = Query(20, ge=1),
    svc: AnalyticsService = Depends(get_analytics_service),
    user_id: str = Depends(auth_required),
):
    return svc.get_top_merchants(user_id, limit)

@router.get("/analytics/merchants/{merchant_name}", tags=["Analytics"], summary="Get merchant details")
def get_merchant_detail(
    merchant_name: str,
    svc: AnalyticsService = Depends(get_analytics_service),
    user_id: str = Depends(auth_required),
):
    detail = svc.get_merchant_detail(user_id, merchant_name)
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
    user_id: str,
    year: int | None = Query(default=None, ge=1970, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    start_date: str | None = None,
    end_date: str | None = None,
    response: Response = None,
    analysis_service: AnalysisService = Depends(get_analysis_service),
    _: str = Depends(auth_required),
):
    """Return analysis for a given user via the AnalysisService."""
    result = analysis_service.analyze(user_id=user_id, year=year, month=month, start_date=start_date, end_date=end_date, use_cache=True)
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
def analysis_chat(
    request: ChatRequest,
    response: Response = None,
    analysis_service: AnalysisService = Depends(get_analysis_service),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    _: str = Depends(auth_required),
):
    """
    Accepts a chat query and returns a response generated by the chat model.
    In production the OpenAI API is used, while locally a running Ollama instance
    provides the responses. The query is sent together with the analysis data
    for the requested month (if any).

    The request body is validated by the `ChatRequest` Pydantic model.
    """
    # Re‑use the AnalysisService to get the data for the requested month (fresh read for chat)
    analysis_result = analysis_service.analyze(
        user_id=request.user_id,
        year=request.year,
        month=request.month,
        start_date=request.start_date,
        end_date=request.end_date,
        use_cache=False,
    )

    # Attempt RAG context retrieval for item/merchant-specific queries
    rag_context = analytics_service.build_rag_context(
        user_email=request.user_id,
        query=request.query,
    )

    # Pass the query + analysis + optional RAG context to the appropriate chat model
    chat_response = call_chat_model(
        query=request.query, analysis=analysis_result,
        model=request.model, rag_context=rag_context,
    )

    return {"response": chat_response}


@router.post(
    "/ingest/receipt/parse",
    response_model=ReceiptParseResponse,
    tags=["Expenses"],
    summary="OCR and parse a receipt without persisting",
)
def parse_receipt(
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
    _: str = Depends(auth_required),
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
    subtotal = sum(i.get("line_total", 0) for i in items)
    tax = header.get("tax", 0)
    tip = header.get("tip", 0)
    discount = header.get("discount", 0)
    if abs(subtotal + tax + tip - discount - header["amount"]) > 0.02:
        raise HTTPException(status_code=400, detail="Totals do not reconcile")
    existing = repo.find_expense_by_fingerprint(payload.user_email, header.get("fingerprint", ""))
    if existing and not force:
        raise HTTPException(status_code=409, detail={"expense_id": existing.get("id")})
    expense_id = repo.append_expense({**header, "user_email": payload.user_email})
    try:
        item_ids = repo.append_items(payload.user_email, expense_id, items)
    except Exception:
        repo.delete_expense(expense_id)
        raise

    # Trigger insights aggregation for item + merchant tracking
    try:
        aggregation_svc.on_expense_with_items_created(
            user_email=payload.user_email,
            expense_id=expense_id,
            merchant_name=header.get("merchant_name"),
            purchased_at=header.get("purchased_at") if isinstance(header.get("purchased_at"), datetime) else None,
            items=items,
        )
    except Exception as exc:
        import logging as _log
        _log.getLogger("varavu_selavu.routes").warning("Insights aggregation failed: %s", exc)

    return {"expense_id": expense_id, "item_ids": item_ids}


@router.get(
    "/models",
    response_model=ModelListResponse,
    tags=["Models"],
    summary="List available LLM models (OpenAI in prod, Ollama locally)",
)
def list_models():
    """Return provider and available model ids based on environment."""
    env = settings.ENVIRONMENT or "local"
    if env.lower() in {"prod", "production"}:
        models = list_openai_models()
        return {"provider": "openai", "models": models}
    models = list_ollama_models()
    return {"provider": "ollama", "models": models}


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
        day_of_month=int(data.day_of_month),
        default_cost=float(data.default_cost),
        start_date_iso=data.start_date_iso,
        status=data.status,
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
    svc: RecurringService = Depends(get_recurring_service),
    expense_service: ExpenseService = Depends(get_expense_service),
    user_id: str = Depends(auth_required),
):
    # Reload due occurrences to map template data
    due_list = svc.compute_due(user_id)
    due_map = {f"{d['template_id']}__{d['date_iso']}": d for d in due_list}
    # Build idempotency set from existing expenses for this user
    existing = expense_service.get_expenses_for_user(user_id)
    existing_keys = set()
    from datetime import datetime as _dt
    for e in existing:
        # e['date'] is MM/DD/YYYY
        key = f"{e['date']}__{e['description']}__{e['category']}"
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
        expense_service.add_expense(
            user_id=user_id,
            date=str(it.get('date_iso')),
            description=d['description'],
            category=d['category'],
            cost=cost,
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
    svc: RecurringService = Depends(get_recurring_service),
    expense_service: ExpenseService = Depends(get_expense_service),
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
        expense_service.add_expense(
            user_id=user_id,
            date=expense_date_iso,
            description=tpl["description"],
            category=tpl["category"],
            cost=use_cost,
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


# ---------------------- Email ---------------------- #

@router.post(
    "/email/send",
    response_model=SendEmailResponse,
    tags=["Email"],
    summary="Send a generic email (feature request, contact us, etc.)",
)
def send_email_route(
    data: SendEmailRequest,
    _: str = Depends(auth_required),
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
        raise HTTPException(status_code=500, detail=f"Failed to send email: {exc}")


# ---------------------- Analytics (Item & Merchant Insights) ---------------------- #

@router.get(
    "/analytics/items",
    tags=["Analytics"],
    summary="Get top items by total spend for a user",
)
def get_top_items(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    _: str = Depends(auth_required),
):
    return analytics_service.get_top_items(user_email=user_id, limit=limit)


@router.get(
    "/analytics/items/{item_name}",
    tags=["Analytics"],
    summary="Get detail for a specific item including price history and store comparison",
)
def get_item_detail(
    item_name: str,
    user_id: str = Query(...),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    _: str = Depends(auth_required),
):
    result = analytics_service.get_item_detail(user_email=user_id, item_name=item_name)
    if result is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return result


@router.get(
    "/analytics/merchants",
    tags=["Analytics"],
    summary="Get top merchants by total spend for a user",
)
def get_top_merchants(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    _: str = Depends(auth_required),
):
    return analytics_service.get_top_merchants(user_email=user_id, limit=limit)


@router.get(
    "/analytics/merchants/{merchant_name}",
    tags=["Analytics"],
    summary="Get detail for a specific merchant including monthly aggregates and items bought",
)
def get_merchant_detail(
    merchant_name: str,
    user_id: str = Query(...),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
    _: str = Depends(auth_required),
):
    result = analytics_service.get_merchant_detail(user_email=user_id, merchant_name=merchant_name)
    if result is None:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return result

