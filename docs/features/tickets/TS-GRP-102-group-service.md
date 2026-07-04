# TS-GRP-102 — GroupService + repo (CRUD, membership, invites)

**Phase:** 1 · **Build order:** 3rd · **Spec:** §5.1, §8.1, §8.6, §14 (E1, E3, E4)

## Scope

Group lifecycle and membership: create/list/get/update/soft-delete groups; add registered or placeholder members; tokenized invites (7-day expiry) + accept; leave group. Establishes the **email→member_id resolution + membership guard** that every other group route reuses.

Endpoints (all under `/api/v1`, JWT-authenticated):
- `POST /groups`, `GET /groups`, `GET /groups/{group_id}`, `PUT /groups/{group_id}`, `DELETE /groups/{group_id}`
- `POST /groups/{group_id}/members`, `DELETE /groups/{group_id}/members/{member_id}`
- `POST /groups/{group_id}/invites`, `POST /groups/invites/accept`, `POST /groups/{group_id}/leave`

Balance-gated operations (leave/remove/delete) call into `BalanceService` from TS-GRP-104; until that exists, gate on "no expenses/settlements reference the member" as an interim and wire the real balance check when 104 lands. (Note this dependency explicitly in the PR.)

## Files it will touch

- **New:** `services/group_service.py` — `GroupService(db: Session)`, mirroring the existing service style (`ExpenseService`, `RecurringService`). Houses the reusable helpers `resolve_member(group_id, email) -> member_id` and `require_membership(group_id, email)` (raises `403`).
- **New (or extend repo):** persistence for groups/members/invites. Follow the existing split where `ExpenseService` uses the ORM directly and `PostgresRepo` wraps lower-level writes — simplest is to keep queries inside `GroupService` using the ORM, consistent with `ExpenseService`.
- **New:** Pydantic models in `models/api_models.py` — `CreateGroupRequest`, `GroupSummary`, `GroupDetailResponse`, `AddMemberRequest` (`{email?}` or `{display_name}`), `MemberDTO`, `CreateInviteResponse` (`{token, url, expires_at}`), `AcceptInviteRequest` (`{token}`). **No `user_id` field** — actor comes from JWT `sub`.
- **New router:** `api/groups_routes.py` with `APIRouter()` + DI provider `get_group_service(db=Depends(get_db))`, included from `api/routes.py` via `router.include_router(groups_router)` (matching how `auth_router` is included). Use `user_email: str = Depends(auth_required)` for the actor.
- `api/routes.py` — add the `include_router` line only.
- Invite token: generate with `secrets.token_urlsafe(...)`; store hash-or-plain in `group_invitations.token` (UNIQUE). Invite URL base from `core/config.py` (add a `PUBLIC_APP_URL`/`INVITE_BASE_URL` setting).

## Acceptance criteria

- `POST /groups` creates the group **and** an `admin` `group_members` row for the creator (`role=admin`, `user_email=creator`, `joined_at=now`).
- `GET /groups` returns only groups where the caller is an active member, each with name, type, member count (my balance may be `0`/omitted until 104).
- Adding a member by a **registered** email links immediately (`user_email` set, `status=active`); by `display_name` only creates a **placeholder** (`user_email NULL`, `status=invited`) (§3.1, E3).
- `POST /groups/{id}/invites` returns `{token, url, expires_at=+7d}`; `POST /groups/invites/accept` with a valid token claims the placeholder seat for the current user (sets `user_email`, `status=active`, `joined_at`).
- Invite errors: expired/used token → `410` (§8.6); accepting into a group where the caller's email is already a member → `409` (E4).
- Non-member hitting any `/groups/{id}/*` route → `403` (§8.6) via `require_membership`.
- `PUT`/`DELETE /groups/{id}` require `role=admin`; `DELETE` is a soft delete (`status=deleted`) and (interim) requires zero-balance or `force=true` → `409` otherwise.
- `leave`/`remove` block on non-zero balance without `force` → `409` (E1); removed member becomes `status=left`, rows retained.

## Dependencies

- **TS-GRP-101** (tables must exist).
- Soft dependency on **TS-GRP-104** for the real balance-zero checks (leave/remove/delete). Ship interim guard + TODO; 104 replaces it.

## Test requirements

- New `tests/test_groups_api.py` (SQLite, FastAPI `TestClient`, mirroring `tests/test_expenses_api.py` and `tests/test_auth.py` for auth-header setup).
- Cases: create group → creator is admin member; add registered vs placeholder member; invite create → accept (happy path); expired token → `410`; duplicate-email accept → `409`; non-member access → `403`; non-admin `PUT`/`DELETE` → `403`; soft-delete sets `status=deleted`.
- Auth: reuse the login/token fixture used by existing API tests so `auth_required` resolves the JWT `sub`.
- Assert placeholder invariant: added-by-name member has `user_email IS NULL` until an invite is accepted.
