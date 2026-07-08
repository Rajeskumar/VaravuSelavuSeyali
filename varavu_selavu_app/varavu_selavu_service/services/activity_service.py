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
