import uuid
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import Expense, ExpensePayer, ExpenseSplit, GroupMember, Settlement
from varavu_selavu_service.services.group_service import GroupService


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class BalanceService:
    """Implements spec §7.1: net(m) = Σpaid − Σowed + Σsettlements_sent − Σsettlements_received.

    Phase 1 only — `transfers` are the literal pairwise accrual (simplify-debts, §7.2, is Phase 2).
    """

    def __init__(self, db: Session):
        self.db = db
        self.group_service = GroupService(db)

    def _coerce_group_id(self, group_id) -> Optional[uuid.UUID]:
        return group_id if isinstance(group_id, uuid.UUID) else _to_uuid(group_id)

    def _coerce_member_id(self, member_id) -> Optional[uuid.UUID]:
        return member_id if isinstance(member_id, uuid.UUID) else _to_uuid(member_id)

    def _compute_nets(self, group_id: uuid.UUID) -> Dict[uuid.UUID, Decimal]:
        members = self.db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
        net_by_member: Dict[uuid.UUID, Decimal] = {m.id: Decimal("0.00") for m in members}

        payers = (
            self.db.query(ExpensePayer)
            .join(Expense, Expense.id == ExpensePayer.expense_id)
            .filter(Expense.group_id == group_id)
            .all()
        )
        for p in payers:
            if p.member_id in net_by_member:
                net_by_member[p.member_id] += p.amount_paid

        splits = (
            self.db.query(ExpenseSplit)
            .join(Expense, Expense.id == ExpenseSplit.expense_id)
            .filter(Expense.group_id == group_id)
            .all()
        )
        for s in splits:
            if s.member_id in net_by_member:
                net_by_member[s.member_id] -= s.amount_owed

        settlements = self.db.query(Settlement).filter(Settlement.group_id == group_id).all()
        for st in settlements:
            if st.from_member_id in net_by_member:
                net_by_member[st.from_member_id] += st.amount
            if st.to_member_id in net_by_member:
                net_by_member[st.to_member_id] -= st.amount

        return net_by_member

    def _pairwise_transfers(self, group_id: uuid.UUID) -> List[Dict]:
        """Literal expense-by-expense pairwise ledger (non-simplified).

        For each group expense (Phase 1 = single payer): every other participant's
        split amount is a debt owed to that expense's payer. Settlements between the
        same two members net directly against that. Spec §7.2 only defines the
        algorithm for the *simplified* (Phase 2) case — this pairwise-accrual method
        for the non-simplified case is not spelled out, so this is a direct derivation
        from §3.1/§7.1, not a literal spec transcription.
        """
        pair_net: Dict[tuple, Decimal] = {}

        def _add(debtor_id: uuid.UUID, creditor_id: uuid.UUID, amount: Decimal) -> None:
            if debtor_id == creditor_id:
                return
            a, b = sorted([str(debtor_id), str(creditor_id)])
            key = (uuid.UUID(a), uuid.UUID(b))
            sign = 1 if str(debtor_id) == a else -1
            pair_net[key] = pair_net.get(key, Decimal("0.00")) + sign * amount

        expenses = self.db.query(Expense).filter(Expense.group_id == group_id).all()
        for exp in expenses:
            payer_row = self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == exp.id).first()
            if payer_row is None:
                continue
            splits = self.db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == exp.id).all()
            for s in splits:
                if s.member_id != payer_row.member_id:
                    _add(debtor_id=s.member_id, creditor_id=payer_row.member_id, amount=s.amount_owed)

        settlements = self.db.query(Settlement).filter(Settlement.group_id == group_id).all()
        for st in settlements:
            _add(debtor_id=st.from_member_id, creditor_id=st.to_member_id, amount=-st.amount)

        transfers = []
        for (a, b), net in pair_net.items():
            if net > Decimal("0.00"):
                transfers.append({"from_member_id": str(a), "to_member_id": str(b), "amount": float(net)})
            elif net < Decimal("0.00"):
                transfers.append({"from_member_id": str(b), "to_member_id": str(a), "amount": float(-net)})
        return transfers

    def get_balances(self, group_id: str, actor_email: str) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = self._coerce_group_id(group_id)

        members = self.db.query(GroupMember).filter(GroupMember.group_id == gid).all()
        net_by_member = self._compute_nets(gid)

        member_balances = [
            {
                "member_id": str(m.id),
                "display_name": m.display_name,
                "net": float(net_by_member.get(m.id, Decimal("0.00"))),
            }
            for m in members
        ]

        return {
            "group_id": str(gid),
            "members": member_balances,
            "transfers": self._pairwise_transfers(gid),
            "simplified": False,
        }

    def member_net(self, group_id, member_id) -> Decimal:
        """Used by GroupService's leave/remove/delete guards — the real net(m), replacing the interim 'has any activity' proxy."""
        gid = self._coerce_group_id(group_id)
        mid = self._coerce_member_id(member_id)
        if gid is None or mid is None:
            return Decimal("0.00")
        return self._compute_nets(gid).get(mid, Decimal("0.00"))

    def group_is_settled(self, group_id) -> bool:
        gid = self._coerce_group_id(group_id)
        if gid is None:
            return True
        return all(n == Decimal("0.00") for n in self._compute_nets(gid).values())
