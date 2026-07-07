import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import (
    Group,
    GroupInvitation,
    GroupMember,
    User,
)

_VALID_GROUP_TYPES = {"trip", "home", "couple", "other"}
_INVITE_TTL_DAYS = 7


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class GroupService:
    def __init__(self, db: Session):
        self.db = db
        self.settings = Settings()

    # ------------------------------------------------------------------
    # Membership helpers — reused by TS-GRP-104/105 and beyond
    # ------------------------------------------------------------------

    def resolve_member(self, group_id: str, email: str) -> Optional[str]:
        """Returns the member_id (str) of the given email's active seat in a group, or None."""
        member = self._get_active_membership(group_id, email)
        return str(member.id) if member else None

    def require_membership(self, group_id: str, email: str) -> GroupMember:
        """Returns the caller's GroupMember row, or raises 403 if they aren't an active member."""
        member = self._get_active_membership(group_id, email)
        if member is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")
        return member

    def _get_active_membership(self, group_id, email: str) -> Optional[GroupMember]:
        gid = _to_uuid(group_id)
        if gid is None:
            return None
        return (
            self.db.query(GroupMember)
            .filter(
                GroupMember.group_id == gid,
                GroupMember.user_email == email,
                GroupMember.status == "active",
            )
            .first()
        )

    def _get_group_or_404(self, group_id) -> Group:
        gid = _to_uuid(group_id)
        group = self.db.query(Group).filter(Group.id == gid).first() if gid else None
        if group is None or group.status == "deleted":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
        return group

    def _require_admin(self, group_id: str, email: str) -> GroupMember:
        member = self.require_membership(group_id, email)
        if member.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
        return member

    def get_member_by_email(self, group_id, email: str) -> Optional[GroupMember]:
        """Public wrapper around the active-membership lookup, for other services (e.g. GroupExpenseService)."""
        return self._get_active_membership(group_id, email)

    # ------------------------------------------------------------------
    # Balance-zero guard (real net(m), via TS-GRP-104's BalanceService)
    # ------------------------------------------------------------------

    def _member_is_settled(self, group_id, member_id: uuid.UUID) -> bool:
        from varavu_selavu_service.services.balance_service import BalanceService  # local import: avoids a circular import (BalanceService composes GroupService for require_membership)

        return BalanceService(self.db).member_net(group_id, member_id) == 0

    def _group_is_settled(self, group_id: uuid.UUID) -> bool:
        from varavu_selavu_service.services.balance_service import BalanceService

        return BalanceService(self.db).group_is_settled(group_id)

    # ------------------------------------------------------------------
    # DTO builders
    # ------------------------------------------------------------------

    def _member_dto(self, member: GroupMember) -> Dict:
        return {
            "member_id": str(member.id),
            "display_name": member.display_name,
            "role": member.role,
            "status": member.status,
            "user_email": member.user_email,
        }

    def _group_summary(self, group: Group, member_count: int) -> Dict:
        return {
            "group_id": str(group.id),
            "name": group.name,
            "group_type": group.group_type,
            "member_count": member_count,
            "my_balance": 0.0,
        }

    def _group_detail(self, group: Group, members: List[GroupMember]) -> Dict:
        return {
            "group_id": str(group.id),
            "name": group.name,
            "group_type": group.group_type,
            "cover": group.cover,
            "currency": group.currency,
            "simplify_debts": group.simplify_debts,
            "status": group.status,
            "members": [self._member_dto(m) for m in members],
        }

    # ------------------------------------------------------------------
    # Groups CRUD
    # ------------------------------------------------------------------

    def create_group(
        self,
        creator_email: str,
        name: str,
        group_type: str = "other",
        cover: Optional[str] = None,
        currency: str = "USD",
    ) -> Dict:
        if group_type not in _VALID_GROUP_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid group_type: {group_type}")

        group = Group(
            id=uuid.uuid4(),
            name=name,
            group_type=group_type,
            cover=cover,
            currency=currency,
            created_by=creator_email,
        )
        self.db.add(group)
        self.db.flush()

        creator = self.db.query(User).filter(User.email == creator_email).first()
        admin_member = GroupMember(
            id=uuid.uuid4(),
            group_id=group.id,
            user_email=creator_email,
            display_name=(creator.name if creator else None) or creator_email,
            role="admin",
            status="active",
            joined_at=datetime.now(timezone.utc),
        )
        self.db.add(admin_member)
        self.db.commit()

        return self._group_summary(group, member_count=1)

    def list_groups_for_user(self, email: str) -> List[Dict]:
        rows = (
            self.db.query(Group, GroupMember)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_email == email, GroupMember.status == "active", Group.status == "active")
            .all()
        )
        summaries = []
        for group, _member in rows:
            member_count = (
                self.db.query(GroupMember)
                .filter(GroupMember.group_id == group.id, GroupMember.status.in_(["active", "invited"]))
                .count()
            )
            summaries.append(self._group_summary(group, member_count))
        return summaries

    def get_group_detail(self, group_id: str, email: str) -> Dict:
        group = self._get_group_or_404(group_id)
        self.require_membership(group_id, email)
        members = self.db.query(GroupMember).filter(GroupMember.group_id == group.id).all()
        return self._group_detail(group, members)

    def update_group(
        self,
        group_id: str,
        email: str,
        name: Optional[str] = None,
        group_type: Optional[str] = None,
        cover: Optional[str] = None,
    ) -> Dict:
        group = self._get_group_or_404(group_id)
        self._require_admin(group_id, email)

        if group_type is not None and group_type not in _VALID_GROUP_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid group_type: {group_type}")

        if name is not None:
            group.name = name
        if group_type is not None:
            group.group_type = group_type
        if cover is not None:
            group.cover = cover
        self.db.commit()

        members = self.db.query(GroupMember).filter(GroupMember.group_id == group.id).all()
        return self._group_detail(group, members)

    def delete_group(self, group_id: str, email: str, force: bool = False) -> None:
        group = self._get_group_or_404(group_id)
        self._require_admin(group_id, email)

        if not force and not self._group_is_settled(group.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Group has outstanding balances; pass force=true to delete anyway",
            )

        group.status = "deleted"
        self.db.commit()

    # ------------------------------------------------------------------
    # Membership
    # ------------------------------------------------------------------

    def add_member(
        self,
        group_id: str,
        email: str,
        member_email: Optional[str] = None,
        display_name: Optional[str] = None,
    ) -> Dict:
        group = self._get_group_or_404(group_id)
        self.require_membership(group_id, email)

        if not member_email and not display_name:
            raise HTTPException(status_code=400, detail="Provide either email or display_name")

        registered_user = None
        if member_email:
            # group_members.user_email is a FK to users.email — must correspond to a
            # real registered user, otherwise this is a placeholder (name-only, §3.1/E3).
            registered_user = self.db.query(User).filter(User.email == member_email).first()
            if registered_user is None:
                raise HTTPException(
                    status_code=400,
                    detail="No registered user with that email — add them as a placeholder using display_name instead",
                )
            existing = (
                self.db.query(GroupMember)
                .filter(GroupMember.group_id == group.id, GroupMember.user_email == member_email)
                .first()
            )
            if existing:
                raise HTTPException(status_code=409, detail="This person is already a member of the group")

        resolved_display_name = display_name or (registered_user.name if registered_user else None) or member_email

        member = GroupMember(
            id=uuid.uuid4(),
            group_id=group.id,
            user_email=member_email,
            display_name=resolved_display_name,
            role="member",
            status="active" if member_email else "invited",
            joined_at=datetime.now(timezone.utc) if member_email else None,
        )
        self.db.add(member)
        self.db.commit()
        return self._member_dto(member)

    def remove_member(self, group_id: str, email: str, member_id: str, force: bool = False) -> None:
        group = self._get_group_or_404(group_id)
        self._require_admin(group_id, email)

        mid = _to_uuid(member_id)
        member = (
            self.db.query(GroupMember).filter(GroupMember.id == mid, GroupMember.group_id == group.id).first()
            if mid
            else None
        )
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found")

        if not force and not self._member_is_settled(group.id, member.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Member has a non-zero balance; pass force=true to remove anyway",
            )

        member.status = "left"
        self.db.commit()

    def leave_group(self, group_id: str, email: str) -> None:
        member = self.require_membership(group_id, email)

        if not self._member_is_settled(group_id, member.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Settle your balance before leaving this group",
            )

        member.status = "left"
        self.db.commit()

    # ------------------------------------------------------------------
    # Invitations
    # ------------------------------------------------------------------

    def create_invite(self, group_id: str, email: str, member_id: str) -> Dict:
        group = self._get_group_or_404(group_id)
        self.require_membership(group_id, email)

        mid = _to_uuid(member_id)
        member = (
            self.db.query(GroupMember).filter(GroupMember.id == mid, GroupMember.group_id == group.id).first()
            if mid
            else None
        )
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found")

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=_INVITE_TTL_DAYS)

        invite = GroupInvitation(
            id=uuid.uuid4(),
            group_id=group.id,
            member_id=member.id,
            invited_email=member.user_email,
            token=token,
            expires_at=expires_at,
        )
        self.db.add(invite)
        self.db.commit()

        return {
            "token": token,
            "url": f"{self.settings.PUBLIC_APP_URL}/groups/join/{token}",
            "expires_at": expires_at.isoformat(),
        }

    def accept_invite(self, token: str, acceptor_email: str) -> Dict:
        invite = self.db.query(GroupInvitation).filter(GroupInvitation.token == token).first()
        if invite is None:
            raise HTTPException(status_code=404, detail="Invite not found")

        now = datetime.now(timezone.utc)
        expires_at = invite.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if invite.accepted_at is not None or expires_at < now:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite is expired or already used")

        already_member = (
            self.db.query(GroupMember)
            .filter(
                GroupMember.group_id == invite.group_id,
                GroupMember.user_email == acceptor_email,
                GroupMember.status == "active",
            )
            .first()
        )
        if already_member:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You are already a member of this group")

        member = self.db.query(GroupMember).filter(GroupMember.id == invite.member_id).first()
        if member is None:
            raise HTTPException(status_code=404, detail="Member seat no longer exists")

        member.user_email = acceptor_email
        member.status = "active"
        member.joined_at = now
        invite.accepted_at = now
        self.db.commit()

        return {
            "group_id": str(member.group_id),
            "member_id": str(member.id),
            "display_name": member.display_name,
        }
