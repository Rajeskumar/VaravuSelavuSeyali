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

        import decimal
        expenses = self.db.query(Expense).filter(Expense.group_id == group_id).all()
        for exp in expenses:
            payer_rows = self.db.query(ExpensePayer).filter(ExpensePayer.expense_id == exp.id).all()
            if not payer_rows:
                continue
            
            total_paid = sum(p.amount_paid for p in payer_rows)
            if total_paid == Decimal('0.00'):
                continue
                
            splits = self.db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == exp.id).all()
            for s in splits:
                debt_amount = s.amount_owed
                if debt_amount == Decimal('0.00'):
                    continue
                    
                allocated_sum = Decimal('0.00')
                for i, p in enumerate(payer_rows):
                    if i == len(payer_rows) - 1:
                        portion = debt_amount - allocated_sum
                    else:
                        portion = (debt_amount * (p.amount_paid / total_paid)).quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
                        allocated_sum += portion
                        
                    _add(debtor_id=s.member_id, creditor_id=p.member_id, amount=portion)

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

    def _simplified_transfers(self, group_id: uuid.UUID) -> List[Dict]:
        """Greedy-netting simplified transfers (Phase 2)."""
        net_by_member = self._compute_nets(group_id)
        
        # Debtors have net < 0 (they owe money to the group).
        # Creditors have net > 0 (they are owed money by the group).
        debtors = sorted(
            [{"id": str(m), "net": -n} for m, n in net_by_member.items() if n < Decimal("0.00")],
            key=lambda x: x["net"],
            reverse=True
        )
        creditors = sorted(
            [{"id": str(m), "net": n} for m, n in net_by_member.items() if n > Decimal("0.00")],
            key=lambda x: x["net"],
            reverse=True
        )
        
        transfers = []
        i, j = 0, 0
        
        while i < len(debtors) and j < len(creditors):
            debtor = debtors[i]
            creditor = creditors[j]
            
            amount = min(debtor["net"], creditor["net"])
            if amount > Decimal("0.00"):
                transfers.append({
                    "from_member_id": debtor["id"],
                    "to_member_id": creditor["id"],
                    "amount": float(amount)
                })
                
            debtor["net"] -= amount
            creditor["net"] -= amount
            
            if debtor["net"] <= Decimal("0.00"):
                i += 1
            if creditor["net"] <= Decimal("0.00"):
                j += 1
                
        return transfers

    def get_balances(self, group_id: str, actor_email: str) -> Dict:
        self.group_service.require_membership(group_id, actor_email)
        gid = self._coerce_group_id(group_id)
        
        from varavu_selavu_service.db.models import Group
        group = self.db.query(Group).filter(Group.id == gid).first()
        simplify = bool(group.simplify_debts) if group else False

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
        
        transfers = self._simplified_transfers(gid) if simplify else self._pairwise_transfers(gid)

        return {
            "group_id": str(gid),
            "members": member_balances,
            "transfers": transfers,
            "simplified": simplify,
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
