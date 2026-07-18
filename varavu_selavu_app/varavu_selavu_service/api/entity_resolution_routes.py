"""TS-ENT-105: /suggest, /resolve, /canonical endpoints — spec §10 (P0 subset
only; merge/rules/receipt-linking endpoints are P1). Gated behind
ENTITY_RESOLUTION_ENABLED, mirroring groups_routes.require_groups_enabled's
exact pattern (404 rather than 403 when disabled, so the feature's existence
isn't distinguishable from "route doesn't exist" pre-rollout).
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.models.api_models import (
    CanonicalItemDTO,
    CanonicalMerchantDTO,
    CreateCanonicalItemRequest,
    CreateCanonicalMerchantRequest,
    ResolveRequest,
    ResolveResponse,
    SuggestResponse,
)
from varavu_selavu_service.services.entity_resolution_service import EntityResolutionService


def require_entity_resolution_enabled() -> None:
    # Reads Settings() fresh per call (not a cached module-level singleton) so
    # the flag can be toggled at runtime/in tests without reloading this
    # module — same reasoning as groups_routes.require_groups_enabled.
    if not Settings().ENTITY_RESOLUTION_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


def get_entity_resolution_service(db: Session = Depends(get_db)) -> EntityResolutionService:
    return EntityResolutionService(db)


router = APIRouter(tags=["Entity Resolution"], dependencies=[Depends(require_entity_resolution_enabled)])


@router.get("/suggest/merchants", response_model=SuggestResponse, summary="Typo-tolerant merchant typeahead")
def suggest_merchants(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    svc: EntityResolutionService = Depends(get_entity_resolution_service),
    user_email: str = Depends(auth_required),
):
    candidates = svc.suggest(q, "merchant", user_email, limit=limit)
    return {"suggestions": [c.__dict__ for c in candidates]}


@router.get("/suggest/items", response_model=SuggestResponse, summary="Typo-tolerant item typeahead")
def suggest_items(
    q: str = Query(..., min_length=1),
    merchant_id: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    svc: EntityResolutionService = Depends(get_entity_resolution_service),
    user_email: str = Depends(auth_required),
):
    candidates = svc.suggest(q, "item", user_email, merchant_id=merchant_id, limit=limit)
    return {"suggestions": [c.__dict__ for c in candidates]}


@router.post("/resolve/merchant", response_model=ResolveResponse, summary="Resolve a raw merchant string to a canonical entity")
def resolve_merchant(
    data: ResolveRequest,
    svc: EntityResolutionService = Depends(get_entity_resolution_service),
    user_email: str = Depends(auth_required),
):
    result = svc.resolve(data.raw, "merchant", user_email)
    return _result_to_response(result)


@router.post("/resolve/item", response_model=ResolveResponse, summary="Resolve a raw item string to a canonical entity")
def resolve_item(
    data: ResolveRequest,
    svc: EntityResolutionService = Depends(get_entity_resolution_service),
    user_email: str = Depends(auth_required),
):
    result = svc.resolve(data.raw, "item", user_email, brand=data.brand)
    return _result_to_response(result)


@router.post(
    "/canonical/merchants", response_model=CanonicalMerchantDTO, status_code=status.HTTP_201_CREATED,
    summary="Create a user-scoped canonical merchant",
)
def create_canonical_merchant(
    data: CreateCanonicalMerchantRequest,
    db: Session = Depends(get_db),
    svc: EntityResolutionService = Depends(get_entity_resolution_service),
    user_email: str = Depends(auth_required),
):
    canonical_name = svc.normalize(data.display_name, entity_type="merchant")
    if not canonical_name:
        raise HTTPException(status_code=400, detail="display_name is required")
    from varavu_selavu_service.db.models import CanonicalMerchant
    import uuid as _uuid

    entity = CanonicalMerchant(
        id=_uuid.uuid4(), user_email=user_email, canonical_name=canonical_name,
        display_name=data.display_name.strip(), default_category_id=data.default_category_id,
        is_global=False,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return {
        "id": str(entity.id), "canonical_name": entity.canonical_name, "display_name": entity.display_name,
        "default_category_id": entity.default_category_id, "is_global": entity.is_global,
    }


@router.post(
    "/canonical/items", response_model=CanonicalItemDTO, status_code=status.HTTP_201_CREATED,
    summary="Create a user-scoped canonical item",
)
def create_canonical_item(
    data: CreateCanonicalItemRequest,
    db: Session = Depends(get_db),
    svc: EntityResolutionService = Depends(get_entity_resolution_service),
    user_email: str = Depends(auth_required),
):
    canonical_name = svc.normalize(data.display_name, entity_type="item")
    if not canonical_name:
        raise HTTPException(status_code=400, detail="display_name is required")
    from varavu_selavu_service.db.models import CanonicalItem
    import uuid as _uuid

    entity = CanonicalItem(
        id=_uuid.uuid4(), user_email=user_email, canonical_name=canonical_name,
        display_name=data.display_name.strip(), brand=data.brand,
        default_category_id=data.default_category_id, unit_type=data.unit_type, is_global=False,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return {
        "id": str(entity.id), "canonical_name": entity.canonical_name, "display_name": entity.display_name,
        "brand": entity.brand, "default_category_id": entity.default_category_id,
        "unit_type": entity.unit_type, "is_global": entity.is_global,
    }


def _result_to_response(result) -> dict:
    return {
        "status": result.status,
        "canonical": (
            {"id": result.canonical.id, "display_name": result.canonical.display_name, "category_id": result.canonical.category_id}
            if result.canonical is not None else None
        ),
        "candidates": [
            {"id": c.id, "display_name": c.display_name, "score": c.score, "category_id": c.category_id}
            for c in result.candidates
        ],
    }
