import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import GroupMember, Settlement
from varavu_selavu_service.services.group_service import GroupService


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class SettlementService:
    def __init__(self, db: Session):
        self.db = db
        self.group_service = GroupService(db)

    def _dto(self, s: Settlement) -> Dict:
        return {
            "id": str(s.id),
            "group_id": str(s.group_id),
            "from_member_id": str(s.from_member_id),
            "to_member_id": str(s.to_member_id),
            "amount": float(s.amount),
            "method": s.method,
            "settled_at": s.settled_at.isoformat() if s.settled_at else None,
            "notes": s.notes,
            "created_by": s.created_by,
        }

    def _require_members_in_group(self, group_id: uuid.UUID, from_mid: uuid.UUID, to_mid: uuid.UUID) -> None:
        found = {
            m.id
            for m in self.db.query(GroupMember.id)
            .filter(GroupMember.group_id == group_id, GroupMember.id.in_([from_mid, to_mid]))
            .all()
        }
        if from_mid not in found or to_mid not in found:
            raise HTTPException(status_code=400, detail="Both members must belong to this group")

    def create_settlement(
        self,
        group_id: str,
        actor_email: str,
        from_member_id: str,
        to_member_id: str,
        amount: float,
        method: Optional[str] = None,
        settled_at: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Dict:
        # Caller must be a member of the group they're recording a settlement in.
        self.group_service.require_membership(group_id, actor_email)

        if from_member_id == to_member_id:
            raise HTTPException(status_code=400, detail="from_member_id and to_member_id must differ")
        if amount is None or amount <= 0:
            raise HTTPException(status_code=400, detail="amount must be greater than 0")

        gid = _to_uuid(group_id)
        from_mid = _to_uuid(from_member_id)
        to_mid = _to_uuid(to_member_id)
        if from_mid is None or to_mid is None:
            raise HTTPException(status_code=400, detail="Invalid member id")

        self._require_members_in_group(gid, from_mid, to_mid)

        if settled_at:
            try:
                settled_at_dt = datetime.fromisoformat(str(settled_at).replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid settled_at format")
        else:
            settled_at_dt = datetime.now(timezone.utc)

        settlement = Settlement(
            id=uuid.uuid4(),
            group_id=gid,
            from_member_id=from_mid,
            to_member_id=to_mid,
            amount=round(float(amount), 2),
            method=method,
            settled_at=settled_at_dt,
            notes=notes,
            created_by=actor_email,
        )
        self.db.add(settlement)
        self.db.commit()
        # Deliberately no AnalysisService.invalidate_cache() call and no Expense row
        # created — settlements never count as spend (spec rule TS-GRP-R2).
        return self._dto(settlement)

    def list_settlements(self, group_id: str, actor_email: str) -> List[Dict]:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        rows = (
            self.db.query(Settlement)
            .filter(Settlement.group_id == gid)
            .order_by(Settlement.settled_at.desc())
            .all()
        )
        return [self._dto(r) for r in rows]

    def delete_settlement(self, group_id: str, actor_email: str, settlement_id: str) -> None:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        sid = _to_uuid(settlement_id)
        row = (
            self.db.query(Settlement).filter(Settlement.id == sid, Settlement.group_id == gid).first()
            if sid
            else None
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Settlement not found")
        self.db.delete(row)
        self.db.commit()
