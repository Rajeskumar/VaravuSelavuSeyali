import logging
import uuid
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import GroupActivity, GroupMember

logger = logging.getLogger(__name__)


class ActivityService:
    def __init__(self, db: Session):
        self.db = db

    def _coerce_uuid(self, val) -> Optional[uuid.UUID]:
        try:
            return uuid.UUID(str(val))
        except (ValueError, TypeError, AttributeError):
            return None

    def log(
        self,
        group_id: str,
        actor_email: str,
        action: str,
        entity_id: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Logs an activity asynchronously-ish (at least wrapped in try-except so it doesn't fail the main tx).
        In FastAPI we'd usually fire this off to a background task so it runs after the commit.
        """
        try:
            gid = self._coerce_uuid(group_id)
            if not gid:
                return

            # Find actor member id
            actor = (
                self.db.query(GroupMember)
                .filter(GroupMember.group_id == gid, GroupMember.user_email == actor_email)
                .first()
            )
            actor_id = actor.id if actor else None
            ent_id = self._coerce_uuid(entity_id) if entity_id else None

            act = GroupActivity(
                group_id=gid,
                actor_member_id=actor_id,
                action=action,
                entity_id=ent_id,
                payload_json=payload,
            )
            self.db.add(act)
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to log activity {action} for group {group_id}: {e}")

    def get_group_activity(self, group_id: str, limit: int = 50, offset: int = 0):
        gid = self._coerce_uuid(group_id)
        if not gid:
            return []

        rows = (
            self.db.query(GroupActivity)
            .filter(GroupActivity.group_id == gid)
            .order_by(GroupActivity.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows

    def get_expense_history(self, group_id: str, expense_id: str) -> list:
        """TS-GRP-127: per-expense edit history, read from group_activity —
        no separate table. Diffs are computed from the old/new snapshots
        GroupExpenseService.update_expense stores in payload_json."""
        gid = self._coerce_uuid(group_id)
        eid = self._coerce_uuid(expense_id)
        if not gid or not eid:
            return []

        rows = (
            self.db.query(GroupActivity, GroupMember)
            .outerjoin(GroupMember, GroupActivity.actor_member_id == GroupMember.id)
            .filter(
                GroupActivity.group_id == gid,
                GroupActivity.entity_id == eid,
                GroupActivity.action.in_(["expense_created", "expense_updated", "expense_deleted"]),
            )
            .order_by(GroupActivity.created_at.asc())
            .all()
        )

        entries = []
        for activity, member in rows:
            payload = activity.payload_json or {}
            changed_fields: Dict[str, Any] = {}
            if activity.action == "expense_updated" and "old" in payload and "new" in payload:
                old, new = payload["old"] or {}, payload["new"] or {}
                for key in set(old.keys()) | set(new.keys()):
                    if old.get(key) != new.get(key):
                        changed_fields[key] = {"from": old.get(key), "to": new.get(key)}
            else:
                changed_fields = payload

            entries.append({
                "action": activity.action,
                "actor_display_name": member.display_name if member else "Anonymous User",
                "changed_fields": changed_fields,
                "created_at": activity.created_at.isoformat(),
            })
        return entries
