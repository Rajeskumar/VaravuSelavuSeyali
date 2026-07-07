# TS-GRP-119 — Activity feed (writes + `GET /activity` + web/mobile UI)

**Phase:** 2 · **Spec:** §5.5, §6.1 (`group_activity`), §8.3 · **Status:** 📋 Planned

## Scope

The `group_activity` table already exists (`db/models.py:228-241`, migrated in TS-GRP-101) but **nothing writes to it** — confirmed by a repo-wide search: `GroupActivity`/`group_activity` appears only in `models.py` and nowhere in any service. This ticket is entirely about (1) writing to it at every mutation point and (2) exposing/rendering it — no new schema.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/group_service.py` — write a `GroupActivity` row (action, `actor_member_id`, `entity_id`, `payload_json`) inside: `create_group` (action=`group_updated`? — spec's action enum doesn't include a distinct "group_created"; either add one or treat creation as implicit and only log post-creation changes — **recommend adding `group_created`** to the action vocabulary since it's a materially different event from a rename), `update_group` (`group_updated`), `delete_group` (`group_updated` with a `{status: "deleted"}` payload, or a dedicated `group_deleted` action — recommend the latter for feed readability), `add_member` (`member_joined`), `remove_member` (`member_left`), `leave_group` (`member_left`), `accept_invite` (`member_joined`).
- `varavu_selavu_app/varavu_selavu_service/services/group_expense_service.py` — write `expense_added`/`expense_edited`/`expense_deleted` rows in `create_expense`/`update_expense`/`delete_expense`. **Store enough in `payload_json` to power TS-GRP-127 (edit history) for free** — e.g. for `expense_edited`, persist `{old: {...}, new: {...}}` snapshots of description/amount/category/shares, not just "something changed". This is the same `old_shares`/`new_shares` data the route already computes for push notifications (`api/groups_routes.py:352-360,376-379`) — reuse it rather than recomputing.
- `varavu_selavu_app/varavu_selavu_service/services/settlement_service.py` — write `settlement_recorded` on `create_settlement`, and (spec's action enum is missing this — add it) `settlement_deleted` on `delete_settlement`.
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — new `GET /{group_id}/activity?limit=&offset=` route (§8.3), paginated like `list_group_expenses` (`limit`/`offset`/`next_offset` pattern, `groups_routes.py:320-328`). Membership-gated (`require_membership`).
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — new `GroupActivityDTO` (`activity_id`, `action`, `actor_member_id`, `actor_display_name`, `entity_id`, `payload`, `created_at`) and `GroupActivityListResponse` (`items`, `next_offset`).
- **New:** `services/activity_service.py` — a small `ActivityService.log(db, group_id, actor_email_or_member_id, action, entity_id=None, payload=None)` helper so the write call-site in every service above is a one-liner, rather than four services each hand-rolling `GroupActivity(...)` construction. Resolve `actor_member_id` from `actor_email` internally (reuse `GroupService.resolve_member`).
- **Web:** new `varavu_selavu_ui/src/components/groups/ActivityFeed.tsx`; new `Activity` tab on `GroupDetailPage.tsx` (currently `TabKey = 'expenses' | 'balances'`, `GroupDetailPage.tsx:44` — this is the second ticket to want a new tab here, coordinate with **TS-GRP-118**'s `Settings` tab so both land cleanly on the same `TabKey` union rather than conflicting).
- **Mobile:** new `varavu_selavu_mobile/src/components/ActivityList.tsx`; new `Activity` tab on `GroupDetailScreen.tsx` (currently `Tab = 'expenses' | 'balances'`, deferred explicitly in TS-GRP-109's own notes: *"Stats/Activity tabs deferred as Phase 1 optional per §12.2"*).

## Acceptance criteria

- Every mutation in §5.5's event list produces exactly one `group_activity` row: expense added/edited/deleted, settlement recorded/deleted, member joined/left, group renamed/settings-changed/deleted.
- `GET /{group_id}/activity` returns rows newest-first, paginated, with human-readable actor names (join to `group_members.display_name`, handling the anonymized-member case from **TS-GRP-112** gracefully — an actor whose `group_members.user_email` was nulled out should still show their `display_name`, which is separately preserved).
- Non-member access → `403`.
- Activity writes never fail the parent request — wrap each `ActivityService.log` call in a try/except-and-log, matching the existing fire-and-forget posture already established for `NotificationService.fan_out` (`groups_routes.py` calls it via `background_tasks.add_task`, and `notification_service.py`'s own `_send_expo_push` never raises into the caller). Recommend the same `background_tasks.add_task` pattern for activity writes if they're not trivially synchronous — though unlike push notifications these are a single local DB insert, so synchronous-but-defensively-wrapped is also acceptable; pick one and be consistent across all call sites.
- Manual verification: perform one of each of the 8 events in a live/dev environment and confirm the feed renders all 8 in order, on both web and mobile.

## Dependencies

- **TS-GRP-101** (table already exists), **TS-GRP-102**, **TS-GRP-104**, **TS-GRP-105** (the three services that need write call-sites).

## Test requirements

- New `varavu_selavu_app/tests/test_group_activity.py`: one test per event type asserting a `group_activity` row is created with the right `action`/`entity_id`; a pagination test; a non-member `403` test; a test that an activity-write failure (mock the DB insert to raise) does not roll back or fail the parent mutation.
- Web: new `ActivityFeed.test.tsx`. Mobile: extend groups test coverage or add `ActivityList` tests.
