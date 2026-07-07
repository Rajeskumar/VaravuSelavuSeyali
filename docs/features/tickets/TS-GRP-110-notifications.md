# TS-GRP-110 — NotificationService + device_tokens + Expo push

**Phase:** 1 · **Build order:** 10th · **Spec:** §5.5, §6.1 (`device_tokens`), §8.3, §12.3

**Status:** ✅ Implemented, pending review (see Implementation notes below)

## Scope

Mobile push notifications (no email) for core group events, plus device-token registration. On a group mutation, fan out an Expo push to all group members **except the actor**. Fire-and-forget: a push failure must never fail the originating request.

**P1 event set:** expense added / edited / deleted; settlement recorded; member joined. Edit notifications include the recipient's **share delta** (the trust mechanism for any-member-can-edit).

## Files it will touch

### Backend
- **New table** `device_tokens` (§6.1) — add ORM model to `db/models.py` + an Alembic migration (this table was deliberately deferred from TS-GRP-101). Portable types; `UNIQUE(user_email, expo_push_token)`.
- **New:** `services/notification_service.py` — `NotificationService`; builds payloads and POSTs batched to Expo (`https://exp.host/--/api/v2/push/send`). Fire-and-forget via FastAPI `BackgroundTasks` (the codebase already uses `background_tasks.add_task(...)` for insights aggregation — see `api/routes.py:151,217,257`); mirror that pattern. Add a retry/log path; never raise into the request.
- **New endpoints:** `POST /devices/register` (upsert `{expo_push_token, platform}`), `DELETE /devices/register` (unregister on logout). Add to a router (either `api/routes.py` or `api/groups_routes.py`); actor from `auth_required` (JWT `sub`).
- **New Pydantic:** `RegisterDeviceRequest` in `models/api_models.py`.
- **Wire fan-out** into the TS-GRP-104 group-expense create/edit/delete routes and the TS-GRP-105 settlement route, and TS-GRP-102 member-join — each adds a `background_tasks.add_task(notification_service.fan_out, …)` excluding the actor. For edits, compute each recipient's old vs new `amount_owed` to include the delta.
- `core/config.py` — add any Expo config needed (e.g. `EXPO_PUSH_URL` default, optional access token).

### Mobile
- Add deps `expo-notifications` + `expo-device` (NOT currently installed — verified in `package.json`).
- On login / app start (`App.tsx` auth flow / `src/context/`): request permission, get `ExponentPushToken`, `POST /devices/register`; on logout, `DELETE /devices/register`.
- **New:** `varavu_selavu_mobile/src/api/devices.ts` (via `apiFetch.ts`).
- Notification handler: deep-link payload `trackspense://groups/{id}` (reuse the `expo-linking` config from TS-GRP-109) so tapping a push opens the group.

## Acceptance criteria

- `POST /devices/register` upserts (same `user_email`+token = no duplicate row, `last_seen_at` refreshed); `DELETE` removes it.
- On expense add/edit/delete, settlement recorded, and member joined, every group member **except the actor** with a registered token receives a push; the actor never does.
- Edit push includes the recipient's share delta (e.g. "$30.00 → $27.00") only when their share changed.
- A push send failure (Expo down / bad token) is logged and does **not** fail or slow the originating API request (runs in `BackgroundTasks`).
- Invalid/expired Expo tokens returned by the receipt response are pruned from `device_tokens`.
- Tapping a push opens the correct group via deep link.

## Dependencies

- **TS-GRP-101** style migration for `device_tokens` (new migration here), **TS-GRP-104** (expense mutations) + **TS-GRP-105** (settlements) + **TS-GRP-102** (member join) to hook into, **TS-GRP-109** (mobile nav + `expo-linking` deep-link config).

## Test requirements

- Backend: new `tests/test_devices_api.py` (SQLite) — register upsert idempotency, unregister.
- Backend: `tests/test_notifications.py` with the Expo HTTP call **mocked** — assert fan-out excludes the actor, targets the right members, computes edit deltas, and that a mocked send failure does not raise into the route (call the route, assert `2xx` + error logged).
- Mobile: unit test token-registration flow with `expo-notifications` mocked; permission-denied path is a no-op (no crash).
- Manual: two devices in one group; actions on device A produce pushes on device B only.

## Implementation notes (post-build)

**Backend** (`varavu_selavu_app/`):
- `DeviceToken` ORM model added to `db/models.py` (mirrors `GroupMember`'s conventions: UUID PK, `UniqueConstraint("user_email", "expo_push_token")`, FK to `users.email` with `ondelete="CASCADE"`). New Alembic migration `fdb24441b181_device_tokens.py` (`down_revision = fa0f13339186`), generated via `alembic revision --autogenerate` and verified by applying it against the local Postgres dev DB — picked up only the new table, nothing else.
- `services/notification_service.py` — new `NotificationService`: `register_device`/`unregister_device` (upsert semantics, refreshes `last_seen_at`), and `fan_out(group_id, actor_email, event_type, **event_data)`, which builds per-recipient message bodies (share deltas, settlement "paid you" personalization) and POSTs batched (100/request) to Expo. `fan_out`'s outer method catches and logs every exception — it is never allowed to raise, matching the ticket's fire-and-forget requirement.
- **New routes** `POST /devices/register` / `DELETE /devices/register` in a new `api/devices_routes.py`, gated behind `GROUPS_ENABLED` (reusing `groups_routes.py`'s `require_groups_enabled` dependency) — its only current purpose is group-event push, so it stays behind the same rollout flag as everything else.
- **Wired fan-out** into `groups_routes.py`'s `create_group_expense`, `update_group_expense`, `delete_group_expense`, `create_settlement`, `add_member`, and `accept_invite` via `background_tasks.add_task(...)`, matching the existing `InsightsAggregationService` pattern (`api/routes.py:145-151` etc.) exactly. For edits, the **old** per-member shares are snapshotted in the route *before* calling `GroupExpenseService.update_expense` (which deletes+re-inserts `expense_splits` atomically) — otherwise the "old" values would already be gone from the DB by the time the background task runs.
- **Shared-code touch, and why it's safe:** `groups_routes.py` gained a local `_to_uuid` helper and new `Expense`/`ExpenseSplit` imports, used only to read pre/post state for notification payloads (pure reads, no new writes). `ExpenseService` (personal-expense path) and `AnalysisService` were **not touched** — personal-expense behavior is unaffected.
- **Simplification vs. the ticket's literal wording on token pruning:** Expo's real flow is two-step (send → get a per-message "ticket" → later poll `/getReceipts` for final delivery status, where `DeviceNotRegistered` typically surfaces). Implementing the full async receipt-polling loop was out of proportion for a fire-and-forget background task, so `fan_out` instead prunes a token immediately if the **initial send response** already reports `status: "error"` with `details.error == "DeviceNotRegistered"` (Expo does return this immediately for tokens it recognizes as already-invalid). This satisfies the acceptance criterion in the common case but won't catch a token that only fails *after* actual delivery is attempted later. Flagging this as a deliberate scope-down, not a silent gap — a future ticket could add a scheduled job hitting `/getReceipts` for full coverage.
- Tests: `tests/test_devices_api.py` (6 tests) + `tests/test_notifications.py` (8 tests, Expo POST mocked via `unittest.mock.patch`) — all new; full `tests/` suite is 101 passed / 2 skipped (skips are pre-existing, unrelated).

**Mobile** (`varavu_selavu_mobile/`):
- Added `expo-notifications` (`~0.32.17`) and `expo-device` (`~8.0.10`) via `npx expo install` (SDK-54-compatible versions).
- New `src/api/devices.ts` (mirrors `api/groups.ts`'s `ApiError`/`handleResponse` pattern) and `src/notifications.ts` (`registerForPushNotifications`, `unregisterPushNotifications`, `extractGroupIdFromNotificationData`) — registration is entirely best-effort: a denied permission or simulator (`Device.isDevice === false`) is a silent no-op, and any thrown error is caught and logged, never propagated (matches the backend's fire-and-forget philosophy).
- Wired into `src/context/AuthContext.tsx`: `registerForPushNotifications()` fires after a successful `signIn` **and** on app-start bootstrap when a token is already present (covers both halves of "on login / app start" from the ticket); `unregisterPushNotifications()` runs at the *start* of `signOut`, before the access token is cleared (it needs a valid JWT to authenticate the `DELETE` call).
- `App.tsx`: added an `expo-notifications` response listener (plus `getLastNotificationResponseAsync()` for the killed-and-relaunched-by-tap case) inside `AppShell` that extracts `group_id` from the notification's `data` payload and calls `navigation.navigate('GroupDetail', { groupId })` directly — simpler and more reliable than round-tripping through `Linking.openURL` and TS-GRP-109's existing `NavigationContainer` `linking` config, while still landing on the exact same screen.
- Tests: new `src/__tests__/notifications.test.ts` (12 tests, `expo-notifications`/`expo-device`/`api/devices` mocked). Full mobile suite: 28 passed (16 pre-existing + 12 new).

**Not done / explicitly deferred (drift, not silently dropped):**
- The two-device manual smoke test ("actions on device A produce pushes on device B only") requires physical devices + EAS push credentials and wasn't run — the backend fan-out logic and mobile registration/handler code are each unit-tested in isolation instead, and the message-building logic was verified against the spec's exact copy examples (§12.3) in `test_notifications.py`.
- No Activity Feed writes (`GroupActivity` table) — that's explicitly P2 per spec §5.5/§16, out of this ticket's scope, and the table already exists unused from TS-GRP-101's migration.
- `notification preferences` (per-group mute, per-event toggles) is P3 per spec, not attempted.
