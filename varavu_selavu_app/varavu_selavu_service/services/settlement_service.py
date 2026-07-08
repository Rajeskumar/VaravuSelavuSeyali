import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, GroupMember, Settlement
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
        from varavu_selavu_service.services.activity_service import ActivityService
        self.activity_svc = ActivityService(db)

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
        
        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="settlement_created",
            entity_id=str(settlement.id),
            payload={"amount": float(settlement.amount)}
        )
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
        
        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="settlement_deleted",
            entity_id=settlement_id
        )

    # ------------------------------------------------------------------
    # Settle-by-expense (TS-GRP-129) — sugar over create_settlement: settling
    # one member's share of one expense IS a Settlement for exactly that
    # amount between that member and the payer. The only new behavior is
    # tracking which settlement covers which split, so the UI can show a
    # per-expense "paid" badge and refuse to double-settle the same share.
    # ------------------------------------------------------------------

    def settle_expense_share(
        self,
        group_id: str,
        expense_id: str,
        actor_email: str,
        member_id: str,
        payer_member_id: Optional[str] = None,
        method: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        eid = _to_uuid(expense_id)
        mid = _to_uuid(member_id)
        if gid is None or eid is None or mid is None:
            raise HTTPException(status_code=400, detail="Invalid id")

        expense = self.db.query(Expense).filter(Expense.id == eid, Expense.group_id == gid).first()
        if expense is None:
            raise HTTPException(status_code=404, detail="Group expense not found")

        split = (
            self.db.query(ExpenseSplit)
            .filter(ExpenseSplit.expense_id == eid, ExpenseSplit.member_id == mid)
            .first()
        )
        if split is None:
            raise HTTPException(status_code=404, detail="This member has no share in this expense")
        if split.settled_via_settlement_id is not None:
            raise HTTPException(status_code=409, detail="This share has already been settled")

        payers = self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == eid).all()
        if not payers:
            raise HTTPException(status_code=400, detail="Expense has no payers")

        if payer_member_id is not None:
            payer_mid = _to_uuid(payer_member_id)
            if payer_mid is None or payer_mid not in {p.member_id for p in payers}:
                raise HTTPException(status_code=400, detail="payer_member_id is not a payer on this expense")
        elif len(payers) == 1:
            payer_mid = payers[0].member_id
        else:
            raise HTTPException(
                status_code=400,
                detail="This expense has multiple payers; payer_member_id is required",
            )

        if payer_mid == mid:
            # The member being settled is themself a payer on this expense (e.g. they
            # front their own share among others) — nothing to settle.
            raise HTTPException(status_code=400, detail="member_id and payer_member_id must differ")

        settlement = Settlement(
            id=uuid.uuid4(),
            group_id=gid,
            from_member_id=mid,
            to_member_id=payer_mid,
            amount=round(float(split.amount_owed), 2),
            method=method,
            settled_at=datetime.now(timezone.utc),
            notes=notes,
            created_by=actor_email,
        )
        self.db.add(settlement)
        self.db.flush()

        split.settled_via_settlement_id = settlement.id
        self.db.commit()

        self.activity_svc.log(
            group_id=group_id,
            actor_email=actor_email,
            action="expense_share_settled",
            entity_id=expense_id,
            payload={"member_id": member_id, "amount": float(settlement.amount)},
        )
        return self._dto(settlement)
