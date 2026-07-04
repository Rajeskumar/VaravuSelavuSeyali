# TS-GRP-110 — NotificationService + device_tokens + Expo push

**Phase:** 1 · **Build order:** 10th · **Spec:** §5.5, §6.1 (`device_tokens`), §8.3, §12.3

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
