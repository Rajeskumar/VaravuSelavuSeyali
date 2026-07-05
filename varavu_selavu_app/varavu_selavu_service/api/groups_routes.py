from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.models.api_models import (
    AcceptInviteRequest,
    AcceptInviteResponse,
    AddMemberRequest,
    CreateGroupRequest,
    CreateInviteRequest,
    CreateInviteResponse,
    GroupDetailResponse,
    GroupSummary,
    MemberDTO,
    RecordSettlementRequest,
    SettlementDTO,
    UpdateGroupRequest,
)
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.settlement_service import SettlementService


def require_groups_enabled() -> None:
    # Reads Settings() fresh per call (not a cached module-level singleton) so the
    # flag can be toggled at runtime/in tests without reloading this module.
    if not Settings().GROUPS_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


def get_group_service(db: Session = Depends(get_db)) -> GroupService:
    return GroupService(db)


def get_settlement_service(db: Session = Depends(get_db)) -> SettlementService:
    return SettlementService(db)


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
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    return svc.accept_invite(token=data.token, acceptor_email=user_email)


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
    svc: GroupService = Depends(get_group_service),
    user_email: str = Depends(auth_required),
):
    return svc.add_member(group_id, user_email, member_email=data.email, display_name=data.display_name)


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
    svc: SettlementService = Depends(get_settlement_service),
    user_email: str = Depends(auth_required),
):
    return svc.create_settlement(
        group_id=group_id,
        actor_email=user_email,
        from_member_id=data.from_member_id,
        to_member_id=data.to_member_id,
        amount=data.amount,
        method=data.method,
        settled_at=data.settled_at,
        notes=data.notes,
    )


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
