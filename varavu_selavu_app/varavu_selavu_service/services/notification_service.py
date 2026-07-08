import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import requests
from sqlalchemy.orm import Session

from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import DeviceToken, Group, GroupMember, GroupNotificationPreference
from varavu_selavu_service.services.group_service import GroupService

logger = logging.getLogger("varavu_selavu.notifications")

_EXPO_BATCH_SIZE = 100  # Expo's push API caps a single request at 100 messages.


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class NotificationService:
    def __init__(self, db: Session):
        self.db = db
        self.settings = Settings()
        self.group_service = GroupService(db)

    # ------------------------------------------------------------------
    # Device registration (§6.1, §8.3)
    # ------------------------------------------------------------------

    def register_device(self, user_email: str, expo_push_token: str, platform: str) -> DeviceToken:
        existing = (
            self.db.query(DeviceToken)
            .filter(DeviceToken.user_email == user_email, DeviceToken.expo_push_token == expo_push_token)
            .first()
        )
        if existing is not None:
            existing.platform = platform
            existing.last_seen_at = _utcnow()
            self.db.commit()
            return existing

        token = DeviceToken(
            id=uuid.uuid4(),
            user_email=user_email,
            expo_push_token=expo_push_token,
            platform=platform,
        )
        self.db.add(token)
        self.db.commit()
        self.db.refresh(token)
        return token

    def unregister_device(self, user_email: str, expo_push_token: str) -> None:
        self.db.query(DeviceToken).filter(
            DeviceToken.user_email == user_email, DeviceToken.expo_push_token == expo_push_token
        ).delete()
        self.db.commit()

    # ------------------------------------------------------------------
    # Notification preferences (TS-GRP-125) — per-(user, group) mute +
    # per-event-type suppression. Absence of a row means "notify" (default).
    # ------------------------------------------------------------------

    def get_preferences(self, user_email: str, group_id: str) -> dict:
        gid = _to_uuid(group_id)
        pref = (
            self.db.query(GroupNotificationPreference)
            .filter(GroupNotificationPreference.user_email == user_email, GroupNotificationPreference.group_id == gid)
            .first()
            if gid is not None
            else None
        )
        if pref is None:
            return {"group_id": group_id, "muted": False, "muted_events": []}
        return {"group_id": group_id, "muted": pref.muted, "muted_events": list(pref.muted_events or [])}

    def update_preferences(
        self, user_email: str, group_id: str, muted: Optional[bool] = None, muted_events: Optional[List[str]] = None
    ) -> dict:
        gid = _to_uuid(group_id)
        pref = (
            self.db.query(GroupNotificationPreference)
            .filter(GroupNotificationPreference.user_email == user_email, GroupNotificationPreference.group_id == gid)
            .first()
            if gid is not None
            else None
        )
        if pref is None:
            pref = GroupNotificationPreference(
                id=uuid.uuid4(), user_email=user_email, group_id=gid, muted=False, muted_events=[]
            )
            self.db.add(pref)
        if muted is not None:
            pref.muted = muted
        if muted_events is not None:
            pref.muted_events = muted_events
        self.db.commit()
        return {"group_id": group_id, "muted": pref.muted, "muted_events": list(pref.muted_events or [])}

    def _is_suppressed(self, user_email: str, group_id: uuid.UUID, event_type: str) -> bool:
        pref = (
            self.db.query(GroupNotificationPreference)
            .filter(GroupNotificationPreference.user_email == user_email, GroupNotificationPreference.group_id == group_id)
            .first()
        )
        if pref is None:
            return False
        if pref.muted:
            return True
        return event_type in (pref.muted_events or [])

    # ------------------------------------------------------------------
    # Fan-out (§12.3) — fire-and-forget: never raises into the caller,
    # since this always runs via FastAPI BackgroundTasks after the
    # originating group mutation has already been committed/returned.
    # ------------------------------------------------------------------

    def fan_out(self, group_id: str, actor_email: str, event_type: str, **event_data) -> None:
        try:
            self._fan_out(group_id, actor_email, event_type, event_data)
        except Exception:
            logger.exception(
                "NotificationService.fan_out failed (group_id=%s, event_type=%s)", group_id, event_type
            )

    def _fan_out(self, group_id: str, actor_email: str, event_type: str, event_data: dict) -> None:
        gid = _to_uuid(group_id)
        if gid is None:
            return
        group = self.db.query(Group).filter(Group.id == gid).first()
        if group is None:
            return

        actor_member = self.group_service.get_member_by_email(group_id, actor_email)
        actor_name = actor_member.display_name if actor_member is not None else actor_email

        exclude_emails = {actor_email} | set(event_data.get("exclude_emails") or [])
        recipients = (
            self.db.query(GroupMember)
            .filter(
                GroupMember.group_id == gid,
                GroupMember.status == "active",
                GroupMember.user_email.isnot(None),
            )
            .all()
        )
        recipients = [
            m for m in recipients
            if m.user_email not in exclude_emails and not self._is_suppressed(m.user_email, gid, event_type)
        ]
        if not recipients:
            return

        messages: List[Dict] = []
        token_owner: Dict[str, str] = {}
        for member in recipients:
            body = self._build_body(event_type, actor_name, group.name, member, event_data)
            if not body:
                continue
            tokens = self.db.query(DeviceToken).filter(DeviceToken.user_email == member.user_email).all()
            for t in tokens:
                messages.append(
                    {
                        "to": t.expo_push_token,
                        "title": "TrackSpense",
                        "body": body,
                        "data": {"deep_link": f"trackspense://groups/{group_id}", "group_id": str(group_id)},
                    }
                )
                token_owner[t.expo_push_token] = member.user_email

        if messages:
            self._send_expo_push(messages, token_owner)

    def _build_body(
        self, event_type: str, actor_name: str, group_name: str, member: GroupMember, event_data: dict
    ) -> Optional[str]:
        mid = str(member.id)
        description = event_data.get("description") or "an expense"

        if event_type == "expense_added":
            share = (event_data.get("shares") or {}).get(mid)
            if share is not None:
                return f'{actor_name} added "{description}" in {group_name} — your share is ${share:.2f}'
            return f'{actor_name} added "{description}" in {group_name}'

        if event_type == "expense_edited":
            old_share = (event_data.get("old_shares") or {}).get(mid)
            new_share = (event_data.get("new_shares") or {}).get(mid)
            if old_share is not None and new_share is not None and round(old_share, 2) != round(new_share, 2):
                return (
                    f'{actor_name} edited "{description}" in {group_name} — '
                    f"your share changed ${old_share:.2f} → ${new_share:.2f}"
                )
            return f'{actor_name} edited "{description}" in {group_name}'

        if event_type == "expense_deleted":
            return f'{actor_name} deleted "{description}" in {group_name}'

        if event_type == "settlement_recorded":
            amount = float(event_data.get("amount") or 0.0)
            to_member_id = event_data.get("to_member_id")
            if to_member_id and str(to_member_id) == mid:
                return f"{actor_name} settled up: paid you ${amount:.2f}"
            return f"{actor_name} recorded a settlement of ${amount:.2f} in {group_name}"

        if event_type == "member_joined":
            new_member_name = event_data.get("new_member_display_name") or "A new member"
            return f"{new_member_name} joined {group_name}"

        if event_type == "comment_added":
            return f'{actor_name} commented on "{description}" in {group_name}'

        return None

    # ------------------------------------------------------------------
    # Expo transport
    # ------------------------------------------------------------------

    def _send_expo_push(self, messages: List[Dict], token_owner: Dict[str, str]) -> None:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.settings.EXPO_ACCESS_TOKEN:
            headers["Authorization"] = f"Bearer {self.settings.EXPO_ACCESS_TOKEN}"

        for i in range(0, len(messages), _EXPO_BATCH_SIZE):
            batch = messages[i : i + _EXPO_BATCH_SIZE]
            try:
                resp = requests.post(self.settings.EXPO_PUSH_URL, json=batch, headers=headers, timeout=10)
                resp.raise_for_status()
                body = resp.json()
            except Exception:
                logger.exception("Expo push send failed for a batch of %d messages", len(batch))
                continue

            tickets = body.get("data") or []
            for msg, ticket in zip(batch, tickets):
                if not isinstance(ticket, dict) or ticket.get("status") != "error":
                    continue
                error_code = (ticket.get("details") or {}).get("error")
                if error_code == "DeviceNotRegistered":
                    self._prune_token(token_owner.get(msg["to"]), msg["to"])

    def _prune_token(self, user_email: Optional[str], expo_push_token: str) -> None:
        if not user_email:
            return
        self.db.query(DeviceToken).filter(
            DeviceToken.user_email == user_email, DeviceToken.expo_push_token == expo_push_token
        ).delete()
        self.db.commit()


def _utcnow():
    return datetime.now(timezone.utc)
