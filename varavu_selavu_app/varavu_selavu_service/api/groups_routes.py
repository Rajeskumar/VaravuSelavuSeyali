import uuid
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import Expense, ExpenseSplit, GroupMember, ExpenseItem, ExpenseItemSplit
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.models.api_models import (
    AcceptInviteRequest,
    AcceptInviteResponse,
    AddCommentRequest,
    AddMemberRequest,
    BalanceResponse,
    CreateGroupRequest,
    CreateInviteRequest,
    CreateInviteResponse,
    ExpenseCommentDTO,
    ExpenseCommentListResponse,
    ExpenseHistoryResponse,
    FriendBalancesResponse,
    GroupActivityListResponse,
    GroupDetailResponse,
    GroupExpenseCreatedResponse,
    GroupExpenseListResponse,
    GroupExpenseRequest,
    GroupExpenseWithItemsRequest,
    GroupNotificationPreferenceDTO,
    GroupSummary,
    MemberDTO,
    MoveToGroupRequest,
    RecordSettlementRequest,
    SettleExpenseShareRequest,
    SettlementDTO,
    SplitSuggestionResponse,
    UpdateGroupRequest,
    UpdateNotificationPreferenceRequest,
)
from varavu_selavu_service.services.balance_service import BalanceService
from varavu_selavu_service.services.expense_comment_service import ExpenseCommentService
from varavu_selavu_service.services.friend_balance_service import FriendBalanceService
from varavu_selavu_service.services.group_expense_service import GroupExpenseService
from varavu_selavu_service.services.group_export_service import GroupExportService
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.notification_service import NotificationService
from varavu_selavu_service.services.settlement_service import SettlementService
from varavu_selavu_service.services.split_suggestion_service import SplitSuggestionService
from varavu_selavu_service.services.analysis_service import AnalysisService
from varavu_selavu_service.services.insights_aggregation_service import InsightsAggregationService


def _to_uuid(value):
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _get_email_shares(db: Session, eid: uuid.UUID) -> dict:
    if not eid:
        return {}
    results = (
        db.query(ExpenseSplit, GroupMember)
        .join(GroupMember, ExpenseSplit.member_id == GroupMember.id)
        .filter(ExpenseSplit.expense_id == eid)
        .all()
    )
    return {
        m.user_email: float(s.amount_owed)
        for s, m in results if m.user_email
    }


def _get_itemized_email_shares(db: Session, eid: uuid.UUID) -> dict:
    if not eid:
        return {}
    results = (
        db.query(ExpenseItemSplit, ExpenseItem, GroupMember)
        .join(ExpenseItem, ExpenseItemSplit.expense_item_id == ExpenseItem.id)
        .join(GroupMember, ExpenseItemSplit.member_id == GroupMember.id)
        .filter(ExpenseItem.expense_id == eid)
        .all()
    )
    shares = {}
    for split, item, member in results:
        if not member.user_email:
            continue
        if member.user_email not in shares:
            shares[member.user_email] = []
        
        # Calculate proportional quantity based on the share ratio
        share_quantity = float(item.quantity) * float(split.ratio) if item.quantity else 1.0
        
        shares[member.user_email].append({
            "normalized_name": item.normalized_name,
            "item_name": item.item_name,
            "unit_price": float(item.unit_price) if item.unit_price else float(item.line_total),
            "share_quantity": share_quantity,
            "share_amount": float(split.amount),
        })
    return shares


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


def get_insights_aggregation_service(db: Session = Depends(get_db)) -> InsightsAggregationService:
    return InsightsAggregationService(db)


def get_notification_service(db: Session = Depends(get_db)) -> NotificationService:
    # Local provider (mirrors devices_routes.py's) — that module imports
    # require_groups_enabled from this one, so importing back would be circular.
    return NotificationService(db)


def get_expense_comment_service(db: Session = Depends(get_db)) -> ExpenseCommentService:
    return ExpenseCommentService(db)


def get_friend_balance_service(db: Session = Depends(get_db)) -> FriendBalanceService:
    return FriendBalanceService(db)


def get_group_export_service(db: Session = Depends(get_db)) -> GroupExportService:
    return GroupExportService(db)


def get_split_suggestion_service(db: Session = Depends(get_db)) -> SplitSuggestionService:
    return SplitSuggestionService(db)


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
    include_archived: bool = Query(False),
    include_deleted: bool = Query(False),
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    return svc.list_groups_for_user(user_email, include_archived=include_archived, include_deleted=include_deleted)


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
    return svc.update_group(
        group_id, 
        user_email, 
        name=data.name, 
        group_type=data.group_type, 
        cover=data.cover,
        simplify_debts=data.simplify_debts,
        default_split=data.default_split.model_dump() if data.default_split else None
    )


@router.delete("/{group_id}", summary="Soft-delete a group (admin)")
def delete_group(
    group_id: str,
    force: bool = Query(False),
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    svc.delete_group(group_id, user_email, force=force)
    return {"success": True}


@router.post("/{group_id}/archive", summary="Archive a group (admin)")
def archive_group(
    group_id: str,
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    svc.archive_group(group_id, user_email)
    return {"success": True}


@router.post("/{group_id}/unarchive", summary="Unarchive a group (admin)")
def unarchive_group(
    group_id: str,
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    svc.unarchive_group(group_id, user_email)
    return {"success": True}


@router.post("/{group_id}/restore", summary="Restore a deleted group (admin)")
def restore_group(
    group_id: str,
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    svc.restore_group(group_id, user_email)
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
    aggregation_svc: InsightsAggregationService = Depends(get_insights_aggregation_service),
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
        currency=data.currency,
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
    
    from datetime import datetime
    email_shares = _get_email_shares(db, eid)
    if email_shares:
        background_tasks.add_task(
            aggregation_svc.on_group_expense_created,
            member_shares=email_shares,
            merchant_name=data.merchant_name,
            purchased_at=datetime.strptime(row["date"], "%m/%d/%Y"),
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
    aggregation_svc: InsightsAggregationService = Depends(get_insights_aggregation_service),
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
        currency=data.currency,
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
    
    from datetime import datetime
    email_shares = _get_email_shares(db, eid)
    email_item_shares = _get_itemized_email_shares(db, eid)
    if email_shares:
        background_tasks.add_task(
            aggregation_svc.on_group_expense_with_items_created,
            expense_id=row["row_id"],
            member_shares=email_shares,
            member_item_shares=email_item_shares,
            merchant_name=data.merchant_name,
            purchased_at=datetime.strptime(row["date"], "%m/%d/%Y"),
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
    aggregation_svc: InsightsAggregationService = Depends(get_insights_aggregation_service),
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
    gid = _to_uuid(group_id)
    existing = (
        db.query(Expense).filter(Expense.id == eid, Expense.group_id == gid).first()
        if eid is not None and gid is not None
        else None
    )
    old_email_shares = _get_email_shares(db, eid) if existing else {}
    old_merchant = existing.merchant_name if existing else None
    old_purchased_at = existing.purchased_at if existing else None
    
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
        currency=data.currency,
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
    
    from datetime import datetime
    new_email_shares = _get_email_shares(db, eid)
    background_tasks.add_task(
        aggregation_svc.on_group_expense_updated,
        old_member_shares=old_email_shares,
        new_member_shares=new_email_shares,
        old_merchant_name=old_merchant,
        old_purchased_at=old_purchased_at,
        new_merchant_name=data.merchant_name,
        new_purchased_at=datetime.strptime(row["date"], "%m/%d/%Y"),
    )
    
    return {"success": True, "expense": row}


@router.delete("/{group_id}/expenses/{expense_id}", summary="Delete a group expense (any member)")
def delete_group_expense(
    group_id: str,
    expense_id: str,
    background_tasks: BackgroundTasks,
    svc: GroupExpenseService = Depends(get_group_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    aggregation_svc: InsightsAggregationService = Depends(get_insights_aggregation_service),
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
    
    old_email_shares = _get_email_shares(db, eid) if existing else {}
    old_email_item_shares = _get_itemized_email_shares(db, eid) if existing else {}
    old_merchant = existing.merchant_name if existing else None
    old_purchased_at = existing.purchased_at if existing else None

    svc.delete_expense(group_id, expense_id, user_email)
    analysis_service.invalidate_cache()
    background_tasks.add_task(
        notification_service.fan_out,
        group_id=group_id,
        actor_email=user_email,
        event_type="expense_deleted",
        description=description,
    )
    
    if old_email_shares:
        background_tasks.add_task(
            aggregation_svc.on_group_expense_deleted,
            member_shares=old_email_shares,
            merchant_name=old_merchant,
            purchased_at=old_purchased_at,
            member_item_shares=old_email_item_shares,
        )
        
    return {"success": True}


@router.get("/{group_id}/balances", summary="Get member balances and transfers (Phase 1+2)")
def get_group_balances(
    group_id: str,
    svc: BalanceService = Depends(get_balance_service),
    user_email: str = Depends(auth_required),
):
    return svc.get_balances(group_id, user_email)

def get_activity_service(db: Session = Depends(get_db)):
    from varavu_selavu_service.services.activity_service import ActivityService
    return ActivityService(db)

@router.get("/{group_id}/activity", summary="Get group activity feed", response_model=GroupActivityListResponse)
def get_group_activity(
    group_id: str,
    limit: int = 50,
    offset: int = 0,
    svc: "ActivityService" = Depends(get_activity_service),
    group_svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    group_svc.require_membership(group_id, user_email)
    rows = svc.get_group_activity(group_id, limit, offset)
    
    items = []
    for r in rows:
        items.append({
            "id": str(r.id),
            "action": r.action,
            "actor_member_id": str(r.actor_member_id) if r.actor_member_id else None,
            "entity_id": str(r.entity_id) if r.entity_id else None,
            "payload": r.payload_json,
            "created_at": r.created_at.isoformat(),
        })
        
    return {
        "items": items,
        "next_offset": offset + limit if len(rows) == limit else None
    }


# ------------------------------------------------------------------
# Expense edit history (TS-GRP-127) — reads group_activity, no new table.
# ------------------------------------------------------------------

@router.get(
    "/{group_id}/expenses/{expense_id}/history",
    response_model=ExpenseHistoryResponse,
    summary="Per-expense edit history",
)
def get_expense_history(
    group_id: str,
    expense_id: str,
    group_svc: GroupService = Depends(get_group_service),
    activity_svc=Depends(get_activity_service),
    user_email: str = Depends(auth_required),
):
    group_svc.require_membership(group_id, user_email)
    return {"items": activity_svc.get_expense_history(group_id, expense_id)}


# ------------------------------------------------------------------
# Expense comments (TS-GRP-126)
# ------------------------------------------------------------------

@router.get(
    "/{group_id}/expenses/{expense_id}/comments",
    response_model=ExpenseCommentListResponse,
    summary="List comments on a group expense",
)
def list_expense_comments(
    group_id: str,
    expense_id: str,
    svc: ExpenseCommentService = Depends(get_expense_comment_service),
    user_email: str = Depends(auth_required),
):
    return {"items": svc.list_comments(group_id, expense_id, user_email)}


@router.post(
    "/{group_id}/expenses/{expense_id}/comments",
    response_model=ExpenseCommentDTO,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment on a group expense",
)
def add_expense_comment(
    group_id: str,
    expense_id: str,
    data: AddCommentRequest,
    background_tasks: BackgroundTasks,
    svc: ExpenseCommentService = Depends(get_expense_comment_service),
    notification_service: NotificationService = Depends(get_notification_service),
    user_email: str = Depends(auth_required),
):
    comment = svc.add_comment(group_id, expense_id, user_email, data.body)
    background_tasks.add_task(
        notification_service.fan_out,
        group_id=group_id,
        actor_email=user_email,
        event_type="comment_added",
        description=comment["body"][:80],
    )
    return comment


@router.delete(
    "/{group_id}/expenses/{expense_id}/comments/{comment_id}",
    summary="Delete a comment (author only)",
)
def delete_expense_comment(
    group_id: str,
    expense_id: str,
    comment_id: str,
    svc: ExpenseCommentService = Depends(get_expense_comment_service),
    user_email: str = Depends(auth_required),
):
    svc.delete_comment(group_id, expense_id, comment_id, user_email)
    return {"success": True}


# ------------------------------------------------------------------
# Notification preferences (TS-GRP-125) — self-scoped, no admin override.
# ------------------------------------------------------------------

@router.get(
    "/{group_id}/notification_preferences",
    response_model=GroupNotificationPreferenceDTO,
    summary="Get my notification preferences for this group",
)
def get_notification_preferences(
    group_id: str,
    group_svc: GroupService = Depends(get_group_service),
    notification_service: NotificationService = Depends(get_notification_service),
    user_email: str = Depends(auth_required),
):
    group_svc.require_membership(group_id, user_email)
    return notification_service.get_preferences(user_email, group_id)


@router.put(
    "/{group_id}/notification_preferences",
    response_model=GroupNotificationPreferenceDTO,
    summary="Update my notification preferences for this group",
)
def update_notification_preferences(
    group_id: str,
    data: UpdateNotificationPreferenceRequest,
    group_svc: GroupService = Depends(get_group_service),
    notification_service: NotificationService = Depends(get_notification_service),
    user_email: str = Depends(auth_required),
):
    group_svc.require_membership(group_id, user_email)
    return notification_service.update_preferences(user_email, group_id, data.muted, data.muted_events)


# ------------------------------------------------------------------
# Settle-by-expense (TS-GRP-129)
# ------------------------------------------------------------------

@router.post(
    "/{group_id}/expenses/{expense_id}/settle_share",
    response_model=SettlementDTO,
    status_code=status.HTTP_201_CREATED,
    summary="Settle one member's share of a specific expense",
)
def settle_expense_share(
    group_id: str,
    expense_id: str,
    data: SettleExpenseShareRequest,
    svc: SettlementService = Depends(get_settlement_service),
    user_email: str = Depends(auth_required),
):
    return svc.settle_expense_share(
        group_id=group_id,
        expense_id=expense_id,
        actor_email=user_email,
        member_id=data.member_id,
        payer_member_id=data.payer_member_id,
        method=data.method,
        notes=data.notes,
    )


# ------------------------------------------------------------------
# CSV export (TS-GRP-132)
# ------------------------------------------------------------------

@router.get("/{group_id}/export.csv", summary="Export group expenses + settlements as CSV")
def export_group_csv(
    group_id: str,
    svc: GroupExportService = Depends(get_group_export_service),
    group_svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    group = group_svc.get_group_detail(group_id, user_email)
    csv_text = svc.export_csv(group_id, user_email)
    filename = f"{group['name'].replace(' ', '_')}_export.csv"
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ------------------------------------------------------------------
# AI split suggestions (TS-GRP-133) — heuristic, history-based.
# ------------------------------------------------------------------

@router.get(
    "/{group_id}/items/suggest_assignment",
    response_model=SplitSuggestionResponse,
    summary="Suggest which member(s) usually get a given item",
)
def suggest_item_assignment(
    group_id: str,
    item_name: str = Query(...),
    svc: SplitSuggestionService = Depends(get_split_suggestion_service),
    user_email: str = Depends(auth_required),
):
    return {"suggestions": svc.suggest_assignment(group_id, item_name, user_email)}


# ------------------------------------------------------------------
# Cross-group friend balances (TS-GRP-128) — top-level, not group-scoped.
# ------------------------------------------------------------------

friends_router = APIRouter(prefix="/friends", tags=["Groups"], dependencies=[Depends(require_groups_enabled)])


@friends_router.get(
    "/balances",
    response_model=FriendBalancesResponse,
    summary="Net balance with each person across all shared groups",
)
def get_friend_balances(
    svc: FriendBalanceService = Depends(get_friend_balance_service),
    user_email: str = Depends(auth_required),
):
    return {"balances": svc.get_friend_balances(user_email)}


# ------------------------------------------------------------------
# Personal -> group expense conversion (TS-GRP-121) — top-level, not
# group-scoped (the source expense isn't a group expense until this runs).
# ------------------------------------------------------------------

expenses_router = APIRouter(prefix="/expenses", tags=["Groups"], dependencies=[Depends(require_groups_enabled)])


@expenses_router.post(
    "/{expense_id}/move_to_group",
    response_model=GroupExpenseCreatedResponse,
    summary="Convert a personal expense into a group expense in place",
)
def move_expense_to_group(
    expense_id: str,
    data: MoveToGroupRequest,
    background_tasks: BackgroundTasks,
    svc: GroupExpenseService = Depends(get_group_expense_service),
    analysis_service: AnalysisService = Depends(get_analysis_service),
    notification_service: NotificationService = Depends(get_notification_service),
    db: Session = Depends(get_db),
    user_email: str = Depends(auth_required),
):
    row = svc.convert_personal_expense(
        expense_id=expense_id,
        group_id=data.group_id,
        actor_email=user_email,
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
        group_id=data.group_id,
        actor_email=user_email,
        event_type="expense_added",
        description=row["description"],
        shares=shares,
    )
    return {"success": True, "expense": row}
