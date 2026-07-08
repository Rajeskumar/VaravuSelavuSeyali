# TS-GRP-122 — Group archive & restore (30-day window)

**Phase:** 2 · **Spec:** §5.1, §14 (E6) · **Status:** 📋 Planned

## Scope

Today `GroupService.delete_group` (`group_service.py:217-228`) does a single flat soft-delete: `group.status = "deleted"`, with no distinction from the spec's three-state model (`active|archived|deleted`, `db/models.py:152`) and no restore path or expiry tracking. This ticket splits that into two real actions and adds the 30-day restore window from E6 ("Restorable for 30 days").

- **Archive** — a reversible, non-destructive "hide this group from my active list" action any admin can take at any time (no balance-zero requirement — archiving isn't deletion).
- **Delete** — the existing balance-gated soft-delete (`_group_is_settled` check, `group_service.py:221-225`, unchanged), but now tracked with a timestamp so it can be restored within 30 days, after which it's eligible for a (future, out-of-scope-here) hard purge.

## Files it will touch

- **New:** Alembic migration adding `groups.archived_at` (nullable `DateTime(timezone=True)`) and `groups.deleted_at` (nullable `DateTime(timezone=True)`) — needed because `status` alone can't express "deleted 3 days ago, still restorable" vs. "deleted 45 days ago, purge-eligible" (E6's 30-day window is time-based, not just a status flag).
- `varavu_selavu_app/varavu_selavu_service/db/models.py` — add both columns to `Group` (`models.py:140-153`).
- `varavu_selavu_app/varavu_selavu_service/services/group_service.py`:
  - New `archive_group(group_id, email)` — admin-only (`_require_admin`), sets `status="archived"`, `archived_at=now()`. No balance check.
  - New `unarchive_group(group_id, email)` — admin-only, sets `status="active"`, `archived_at=None`.
  - `delete_group` (`group_service.py:217-228`) — unchanged balance gate, but now also sets `deleted_at=now()`.
  - New `restore_group(group_id, email)` — admin-only; `404` if `deleted_at` is `None` (nothing to restore) or `409` if `now() - deleted_at > 30 days` (window expired); on success, `status="active"`, `deleted_at=None`.
  - `list_groups_for_user` (`group_service.py:169-185`) and `get_group_detail` (`group_service.py:186-191`) — decide and document visibility rules: archived groups should probably still appear (in a separate "Archived" section) since they're not gone, just hidden from the default active list; deleted-but-restorable groups should **not** appear in the default list at all (matches "soft delete" semantics) but must remain queryable by `GET /groups/{id}` for the restore flow itself (don't 404 a group just because it's soft-deleted, or restore becomes impossible from the UI).
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — new `POST /{group_id}/archive`, `POST /{group_id}/unarchive`, `POST /{group_id}/restore` routes.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — `GroupSummary`/`GroupDetailResponse` already expose `status` (`api_models.py:325-341`); no new response model needed beyond maybe surfacing `archived_at`/`deleted_at` for restore-window UI countdown.
- **Web:** `varavu_selavu_ui/src/pages/GroupsPage.tsx` — add an "Archived groups" (and, for admins, "Recently deleted") section/filter; `GroupCard.tsx` gains archive/restore actions in its overflow menu.
- **Mobile:** `varavu_selavu_mobile/src/screens/GroupsScreen.tsx` — same sectioning.

## Acceptance criteria

- Archive: any status, no balance check, reversible via unarchive; archived groups excluded from the default `GET /groups` list but included when an `include_archived=true` query param is passed (or a separate `GET /groups/archived` — pick one convention and apply it consistently with how the web/mobile "Archived" section fetches data).
- Delete: unchanged balance gate (`409` unless settled or `force=true`); sets `deleted_at`.
- Restore within 30 days of `deleted_at`: succeeds, group returns to `status="active"`, fully functional again (members, expenses, balances all intact — nothing was ever hard-deleted).
- Restore after 30 days: `409` (window expired) — this ticket does **not** need to build the actual hard-purge job; just enforce the restore-window boundary correctly.
- Non-admin attempting archive/unarchive/restore → `403`.
- `GET /groups/{group_id}` on a deleted-but-restorable group still succeeds for a member (needed so the restore UI can show group details before the user commits) — but the group must be visually/behaviorally distinct (e.g. a `GroupDetailResponse.status == "deleted"` the UI renders as a read-only "This group was deleted — Restore?" banner rather than the normal interactive detail view).

## Dependencies

- **TS-GRP-102** (`GroupService`).

## Test requirements

- Extend `varavu_selavu_app/tests/test_groups_api.py`: archive/unarchive round-trip, delete-then-restore-within-window success, delete-then-restore-after-window `409` (freeze/mock `datetime.now()` or pass an explicit `as_of` for testability — check whether the codebase already has a time-mocking convention elsewhere before inventing one), non-admin `403` for all three new actions, archived-group excluded from default list but included with the opt-in param.
