# TS-GRP-125 — Notification preferences (per-group mute, per-event toggles)

**Phase:** 3 · **Spec:** §5.5, §12.3 · **Status:** 📋 Planned

## Scope

`NotificationService.fan_out`/`_fan_out` (`services/notification_service.py:70-123`) today sends push to **every** active group member except the actor, unconditionally, for every event type. This ticket adds an opt-out layer: per-group mute, and per-event-type toggles within a group, checked before a push is queued.

## Files it will touch

- **New:** Alembic migration + ORM model `GroupNotificationPreference` (`user_email`, `group_id`, `muted: Boolean default False`, `muted_events: JSON default []` — a list of event-type strings from the existing vocabulary already used by `_fan_out`/`_build_body`: `expense_added`, `expense_edited`, `expense_deleted`, `settlement_recorded`, `member_joined`). `UniqueConstraint(user_email, group_id)`. Portable types per the established convention (Python-side UUID default, `JSON` not `JSONB`).
- `varavu_selavu_app/varavu_selavu_service/services/notification_service.py` — `_fan_out` (`notification_service.py:78-123`) currently loops over all active members except the actor and builds a message per recipient; add a lookup against `GroupNotificationPreference` per recipient before including them (skip if `muted=True`, or if `event_type in muted_events`). Cache nothing — this is a low-volume per-event query, matching the "hundreds of rows" performance posture already accepted elsewhere in this feature (§6.5).
- New `services/notification_preference_service.py` (or fold into `NotificationService`) — `get_preferences(user_email, group_id)`, `update_preferences(user_email, group_id, muted=None, muted_events=None)`.
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` (or `api/devices_routes.py`, since that's where notification-adjacent routes currently live) — new `GET/PUT /groups/{group_id}/notification_preferences` (self-scoped — a user can only read/write their own preferences, no admin override).
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — `GroupNotificationPreferenceDTO` (`muted`, `muted_events`), `UpdateNotificationPreferenceRequest`.
- **Web:** new section on `GroupDetailPage.tsx`'s `Settings` tab (from **TS-GRP-118**) — a group-level mute toggle + a checklist of event types to suppress.
- **Mobile:** same, on `GroupDetailScreen.tsx`'s `Settings` tab.

## Acceptance criteria

- Muting a group stops all push notifications for that group to that user (verified: `_send_expo_push` is never called for that recipient/group pair), without affecting other members' notifications or the muter's notifications from other groups.
- Muting a specific event type (e.g. `expense_added`) within a group still delivers other event types (e.g. `settlement_recorded`) for that same group.
- No preference row for a (user, group) pair = default behavior (all events, unmuted) — don't require a row to exist; absence means "notify."
- A push failure for one recipient (existing behavior: caught, logged, never raised — `notification_service.py`'s `_send_expo_push`) is unaffected by this change; preference filtering happens before the send attempt, not as an error-handling path.
- Non-member attempting to read/write another user's preferences → `403` (or simply scoped so there's no `user_email` param to spoof — derive from the JWT `sub` like every other group route).

## Dependencies

- **TS-GRP-110** (`NotificationService`, `_fan_out`).

## Test requirements

- Extend `varavu_selavu_app/tests/test_notifications.py`: group-mute suppresses all events for that user, event-type mute suppresses only that type, no-preference-row defaults to notify, preferences are per-(user,group) and don't leak across groups.
