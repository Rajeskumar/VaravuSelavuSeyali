import uuid
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import GroupMember
from varavu_selavu_service.services.balance_service import BalanceService
from varavu_selavu_service.services.group_service import GroupService


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class FriendBalanceService:
    """TS-GRP-128: total owed to/from a person across all shared groups.

    Built on top of BalanceService._pairwise_transfers (per-group directed
    debtor->creditor amounts) rather than a new table — this just aggregates
    those across every group the caller shares with each counterparty.

    Registered counterparties (stable user_email) are aggregated across groups.
    Placeholder members have no stable identity across groups, so they are
    never merged — each placeholder appears as its own per-group entry.
    """

    def __init__(self, db: Session):
        self.db = db
        self.group_service = GroupService(db)
        self.balance_service = BalanceService(db)

    def get_friend_balances(self, user_email: str) -> List[Dict]:
        groups = self.group_service.list_groups_for_user(user_email)
        agg: Dict[str, Dict] = {}

        for g in groups:
            group_id = g["group_id"]
            gid = _to_uuid(group_id)
            my_member = self.group_service.get_member_by_email(group_id, user_email)
            if my_member is None or gid is None:
                continue

            transfers = self.balance_service._pairwise_transfers(gid)
            if not transfers:
                continue

            members = self.db.query(GroupMember).filter(GroupMember.group_id == gid).all()
            member_map = {str(m.id): m for m in members}
            my_id = str(my_member.id)

            for t in transfers:
                from_id, to_id, amount = t["from_member_id"], t["to_member_id"], t["amount"]
                if from_id == my_id:
                    counterparty_id, delta = to_id, -amount  # I owe them
                elif to_id == my_id:
                    counterparty_id, delta = from_id, amount  # they owe me
                else:
                    continue

                counterparty = member_map.get(counterparty_id)
                if counterparty is None or delta == 0:
                    continue

                # Registered members aggregate by email; placeholders are scoped to
                # this one group so they never merge with an unrelated placeholder.
                key = counterparty.user_email or f"__placeholder__:{group_id}:{counterparty_id}"

                if key not in agg:
                    agg[key] = {
                        "counterparty_email": counterparty.user_email,
                        "counterparty_display_name": counterparty.display_name,
                        "net": 0.0,
                        "groups": {},
                    }
                agg[key]["net"] += delta
                agg[key]["groups"][group_id] = agg[key]["groups"].get(group_id, 0.0) + delta

        results = []
        for entry in agg.values():
            if round(entry["net"], 2) == 0.0:
                continue
            results.append({
                "counterparty_email": entry["counterparty_email"],
                "counterparty_display_name": entry["counterparty_display_name"],
                "net": round(entry["net"], 2),
                "groups": [
                    {"group_id": gid_, "name": self._group_name(gid_, groups), "net": round(net_, 2)}
                    for gid_, net_ in entry["groups"].items()
                    if round(net_, 2) != 0.0
                ],
            })
        results.sort(key=lambda r: abs(r["net"]), reverse=True)
        return results

    @staticmethod
    def _group_name(group_id: str, groups: List[Dict]) -> str:
        for g in groups:
            if g["group_id"] == group_id:
                return g["name"]
        return ""
