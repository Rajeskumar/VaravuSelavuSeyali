import uuid
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import Expense, ExpenseSplit
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.models.api_models import (
    AcceptInviteRequest,
    AcceptInviteResponse,
    AddMemberRequest,
    BalanceResponse,
    CreateGroupRequest,
    CreateInviteRequest,
    CreateInviteResponse,
    GroupDetailResponse,
    GroupExpenseCreatedResponse,
    GroupExpenseListResponse,
    GroupExpenseRequest,
    GroupExpenseWithItemsRequest,
    GroupSummary,
    MemberDTO,
    RecordSettlementRequest,
    SettlementDTO,
    UpdateGroupRequest,
)
from varavu_selavu_service.services.balance_service import BalanceService
from varavu_selavu_service.services.group_expense_service import GroupExpenseService
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.notification_service import NotificationService
from varavu_selavu_service.services.settlement_service import SettlementService
from varavu_selavu_service.services.analysis_service import AnalysisService


def _to_uuid(value):
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def require_groups_enabled() -> None:
    # Reads Settings() fresh per call (not a cached module-level singleton) so the
    # flag can be toggled at runtime/in tests without reloading this module.
    if not Settings().GROUPS_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


def get_group_service(db: Session = Depends(get_db)) -> GroupService:
    return GroupService(db)


def get_settlement_service(db: Session = Depends(get_db)) -> SettlementService:
    return SettlementService(db)


def get_group_expense_service(db: Session = Depends(get_db)) -> GroupExpenseService:
    return GroupExpenseService(db)


def get_balance_service(db: Session = Depends(get_db)) -> BalanceService:
    return BalanceService(db)


def get_analysis_service(db: Session = Depends(get_db)) -> AnalysisService:
    # Local provider (mirrors api/routes.py's) — importing that one directly would be
    # a circular import, since routes.py imports this module's router.
    return AnalysisService(db=db, ttl_sec=Settings().ANALYSIS_CACHE_TTL_SEC)


def get_notification_service(db: Session = Depends(get_db)) -> NotificationService:
    # Local provider (mirrors devices_routes.py's) — that module imports
    # require_groups_enabled from this one, so importing back would be circular.
    return NotificationService(db)


router = APIRouter(prefix="/groups", tags=["Groups"], dependencies=[Depends(require_groups_enabled)])


@router.post("", response_model=GroupSummary, status_code=status.HTTP_201_CREATED, summary="Create a group")
def create_group(
    data: CreateGroupRequest,
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    return svc.create_group(
        creator_email=user_email,
        name=data.name,
        group_type=data.group_type,
        cover=data.cover,
        currency=data.currency,
    )


@router.get("", response_model=List[GroupSummary], summary="List my groups")
def list_groups(
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    return svc.list_groups_for_user(user_email)


@router.post("/invites/accept", response_model=AcceptInviteResponse, summary="Accept a group invite")
def accept_invite(
    data: AcceptInviteRequest,
    background_tasks: BackgroundTasks,
    svc: GroupService = Depends(get_group_service),
    notification_service: NotificationService = Depends(get_notification_service),
    user_email: str = Depends(auth_required),
):
    result = svc.accept_invite(token=data.token, acceptor_email=user_email)
    # The acceptor is the actor; they're excluded from their own "joined" notification.
    background_tasks.add_task(
        notification_service.fan_out,
        group_id=result["group_id"],
        actor_email=user_email,
        event_type="member_joined",
        new_member_display_name=result["display_name"],
    )
    return result


@router.get("/{group_id}", response_model=GroupDetailResponse, summary="Group detail")
def get_group(
    group_id: str,
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    return svc.get_group_detail(group_id, user_email)


@router.put("/{group_id}", response_model=GroupDetailResponse, summary="Update group name/type/cover (admin)")
def update_group(
    group_id: str,
    data: UpdateGroupRequest,
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    return svc.update_group(group_id, user_email, name=data.name, group_type=data.group_type, cover=data.cover)


@router.delete("/{group_id}", summary="Soft-delete a group (admin)")
def delete_group(
    group_id: str,
    force: bool = Query(False),
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    svc.delete_group(group_id, user_email, force=force)
    return {"success": True}


@router.post(
    "/{group_id}/members",
    response_model=MemberDTO,
    status_code=status.HTTP_201_CREATED,
    summary="Add a registered or placeholder member",
)
def add_member(
    group_id: str,
    data: AddMemberRequest,
    background_tasks: BackgroundTasks,
    svc: GroupService = Depends(get_group_service),
    notification_service: NotificationService = Depends(get_notification_service),
    user_email: str = Depends(auth_required),
):
    member = svc.add_member(group_id, user_email, member_email=data.email, display_name=data.display_name)
    # Only a registered-user seat (status "active") represents an actual join;
    # placeholders (no email, status "invited") have no account/device to notify about.
    if member["status"] == "active" and member.get("user_email"):
        background_tasks.add_task(
            notification_service.fan_out,
            group_id=group_id,
            actor_email=user_email,
            event_type="member_joined",
            new_member_display_name=member["display_name"],
            exclude_emails=[member["user_email"]],
        )
    return member


@router.delete("/{group_id}/members/{member_id}", summary="Remove a member (admin)")
def remove_member(
    group_id: str,
    member_id: str,
    force: bool = Query(False),
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    svc.remove_member(group_id, user_email, member_id, force=force)
    return {"success": True}


@router.post("/{group_id}/invites", response_model=CreateInviteResponse, status_code=status.HTTP_201_CREATED, summary="Create an invite link for a member seat")
def create_invite(
    group_id: str,
    data: CreateInviteRequest,
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    return svc.create_invite(group_id, user_email, member_id=data.member_id)


@router.post("/{group_id}/leave", summary="Leave a group")
def leave_group(
    group_id: str,
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    svc.leave_group(group_id, user_email)
    return {"success": True}


@router.post(
    "/{group_id}/settlements",
    response_model=SettlementDTO,
    status_code=status.HTTP_201_CREATED,
    summary="Record a settlement",
)
def create_settlement(
    group_id: str,
    data: RecordSettlementRequest,
    background_tasks: BackgroundTasks,
    svc: SettlementService = Depends(get_settlement_service),
    notification_service: NotificationService = Depends(get_notification_service),
    user_email: str = Depends(auth_required),
):
    settlement = svc.create_settlement(
        group_id=group_id,
        actor_email=user_email,
        from_member_id=data.from_member_id,
        to_member_id=data.to_member_id,
        amount=data.amount,
        method=data.method,
        settled_at=data.settled_at,
        notes=data.notes,
    )
    background_tasks.add_task(
        notification_service.fan_out,
        group_id=group_id,
        actor_email=user_email,
        event_type="settlement_recorded",
        amount=settlement["amount"],
        to_member_id=settlement["to_member_id"],
    )
    return settlement


@router.get("/{group_id}/settlements", response_model=List[SettlementDTO], summary="Settlement history")
def list_settlements(
    group_id: str,
    svc: SettlementService = Depends(get_settlement_service),
    user_email: str = Depends(auth_required),
):
    return svc.list_settlements(group_id, user_email)


@router.delete("/{group_id}/settlements/{settlement_id}", summary="Undo a settlement")
def delete_settlement(
    group_id: str,
    settlement_id: str,
    svc: SettlementService = Depends(get_settlement_service),
    user_email: str = Depends(auth_required),
):
    svc.delete_settlement(group_id, user_email, settlement_id)
    return {"success": True}


@router.post(
    "/{group_id}/expenses",
    response_model=GroupExpenseCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a group expense",
)
def create_group_expense(
    group_id: str,
    data: GroupExpenseRequest,
    background_tasks: BackgroundTasks,
    svc: GroupExpenseService = Depends(get_group_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    notification_service: NotificationService = Depends(get_notification_service),
    db: Session = Depends(get_db),
    user_email: str = Depends(auth_required),
):
    row = svc.create_expense(
        group_id=group_id,
        actor_email=user_email,
        date=data.date,
        description=data.description,
        category=data.category,
        amount=data.amount,
        merchant_name=data.merchant_name,
        payers=[p.model_dump() for p in data.payers],
        split_type=data.split.type,
        split_entries=[e.model_dump() for e in data.split.entries],
    )
    analysis_service.invalidate_cache()
    eid = _to_uuid(row["row_id"])
    shares = (
        {
            str(s.member_id): float(s.amount_owed)
            for s in db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == eid).all()
        }
        if eid is not None
        else {}
    )
    background_tasks.add_task(
        notification_service.fan_out,
        group_id=group_id,
        actor_email=user_email,
        event_type="expense_added",
        description=row["description"],
        shares=shares,
    )
    return {"success": True, "expense": row}


@router.post(
    "/{group_id}/expenses/itemized",
    response_model=GroupExpenseCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an itemized group expense",
)
def create_itemized_group_expense(
    group_id: str,
    data: GroupExpenseWithItemsRequest,
    background_tasks: BackgroundTasks,
    svc: GroupExpenseService = Depends(get_group_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    notification_service: NotificationService = Depends(get_notification_service),
    db: Session = Depends(get_db),
    user_email: str = Depends(auth_required),
):
    row = svc.create_itemized_expense(
        group_id=group_id,
        actor_email=user_email,
        date=data.date,
        description=data.description,
        category=data.category,
        amount=data.amount,
        merchant_name=data.merchant_name,
        payers=[p.model_dump() for p in data.payers],
        items=[i.model_dump() for i in data.items],
    )
    analysis_service.invalidate_cache()
    eid = _to_uuid(row["row_id"])
    shares = (
        {
            str(s.member_id): float(s.amount_owed)
            for s in db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == eid).all()
        }
        if eid is not None
        else {}
    )
    background_tasks.add_task(
        notification_service.fan_out,
        group_id=group_id,
        actor_email=user_email,
        event_type="expense_added",
        description=row["description"],
        shares=shares,
    )
    return {"success": True, "expense": row}


@router.get("/{group_id}/expenses", response_model=GroupExpenseListResponse, summary="List group expenses")
def list_group_expenses(
    group_id: str,
    limit: int = Query(30, ge=1),
    offset: int = Query(0, ge=0),
    svc: GroupExpenseService = Depends(get_group_expense_service),
    user_email: str = Depends(auth_required),
):
    return svc.list_group_expenses(group_id, user_email, limit=limit, offset=offset)


@router.put(
    "/{group_id}/expenses/{expense_id}",
    response_model=GroupExpenseCreatedResponse,
    summary="Edit a group expense (any member)",
)
def update_group_expense(
    group_id: str,
    expense_id: str,
    data: GroupExpenseRequest,
    background_tasks: BackgroundTasks,
    svc: GroupExpenseService = Depends(get_group_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    notification_service: NotificationService = Depends(get_notification_service),
    db: Session = Depends(get_db),
    user_email: str = Depends(auth_required),
):
    # Capture the pre-edit shares now — GroupExpenseService.update_expense replaces
    # (deletes + re-inserts) expense_splits atomically, so the "old" values are gone
    # from the DB by the time the fire-and-forget notification runs. A malformed
    # expense_id just yields an empty snapshot here; svc.update_expense below is the
    # one responsible for raising the proper 404 in that case.
    eid = _to_uuid(expense_id)
    old_shares = (
        {
            str(s.member_id): float(s.amount_owed)
            for s in db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == eid).all()
        }
        if eid is not None
        else {}
    )

    row = svc.update_expense(
        group_id=group_id,
        expense_id=expense_id,
        actor_email=user_email,
        date=data.date,
        description=data.description,
        category=data.category,
        amount=data.amount,
        merchant_name=data.merchant_name,
        payers=[p.model_dump() for p in data.payers],
        split_type=data.split.type,
        split_entries=[e.model_dump() for e in data.split.entries],
    )
    analysis_service.invalidate_cache()
    new_shares = {
        str(s.member_id): float(s.amount_owed)
        for s in db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == eid).all()
    }
    background_tasks.add_task(
        notification_service.fan_out,
        group_id=group_id,
        actor_email=user_email,
        event_type="expense_edited",
        description=row["description"],
        old_shares=old_shares,
        new_shares=new_shares,
    )
    return {"success": True, "expense": row}


@router.delete("/{group_id}/expenses/{expense_id}", summary="Delete a group expense (any member)")
def delete_group_expense(
    group_id: str,
    expense_id: str,
    background_tasks: BackgroundTasks,
    svc: GroupExpenseService = Depends(get_group_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    notification_service: NotificationService = Depends(get_notification_service),
    db: Session = Depends(get_db),
    user_email: str = Depends(auth_required),
):
    # Snapshot the description before it's gone — svc.delete_expense removes the row
    # (and cascades expense_payers/expense_splits) before this route can read it back.
    eid = _to_uuid(expense_id)
    gid = _to_uuid(group_id)
    existing = (
        db.query(Expense).filter(Expense.id == eid, Expense.group_id == gid).first()
        if eid is not None and gid is not None
        else None
    )
    description = existing.description if existing is not None else None

    svc.delete_expense(group_id, expense_id, user_email)
    analysis_service.invalidate_cache()
    background_tasks.add_task(
        notification_service.fan_out,
        group_id=group_id,
        actor_email=user_email,
        event_type="expense_deleted",
        description=description,
    )
    return {"success": True}


@router.get("/{group_id}/balances", response_model=BalanceResponse, summary="Net balances (non-simplified)")
def get_balances(
    group_id: str,
    svc: BalanceService = Depends(get_balance_service),
    user_email: str = Depends(auth_required),
):
    return svc.get_balances(group_id, user_email)
