import uuid
from collections import Counter
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import ExpenseItem, ExpenseItemSplit, GroupMember
from varavu_selavu_service.services.group_service import GroupService
from varavu_selavu_service.services.insight_analytics_service import canonicalize_name, classify_confidence


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class SplitSuggestionService:
    """TS-GRP-133: heuristic (history-based, not LLM) item->member assignment
    suggestions for the itemized split board — "Alice usually buys the oat
    milk." Suggestions only ever pre-fill an editable UI; nothing here writes
    to the DB. A group with no history for an item returns no suggestion
    rather than a low-confidence guess, matching this codebase's existing
    confidence-suppression posture (TS-ANL-009)."""

    def __init__(self, db: Session):
        self.db = db
        self.group_service = GroupService(db)

    def suggest_assignment(self, group_id: str, item_name: str, actor_email: str) -> List[Dict]:
        self.group_service.require_membership(group_id, actor_email)
        gid = _to_uuid(group_id)
        target = canonicalize_name(item_name)
        if not target:
            return []

        rows = (
            self.db.query(ExpenseItemSplit, ExpenseItem, GroupMember)
            .join(ExpenseItem, ExpenseItemSplit.expense_item_id == ExpenseItem.id)
            .join(GroupMember, ExpenseItemSplit.member_id == GroupMember.id)
            .filter(GroupMember.group_id == gid)
            .all()
        )

        counts: Counter = Counter()
        names: Dict[str, str] = {}
        for split, item, member in rows:
            if canonicalize_name(item.normalized_name or item.item_name) != target:
                continue
            counts[str(member.id)] += 1
            names[str(member.id)] = member.display_name

        if not counts:
            return []

        suggestions = []
        for member_id, times in counts.most_common():
            suggestions.append({
                "member_id": member_id,
                "display_name": names[member_id],
                "confidence": classify_confidence(times),
                "times_assigned": times,
            })
        # Suppress the whole suggestion set at "low" confidence per TS-ANL-009 —
        # a single past occurrence isn't a pattern worth pre-selecting on.
        if all(s["confidence"] == "low" for s in suggestions):
            return []
        return suggestions
