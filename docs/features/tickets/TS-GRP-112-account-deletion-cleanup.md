# TS-GRP-112 — Account-deletion group-aware cleanup

**Phase:** 1 · **Build order:** run any time after TS-GRP-101 lands (can proceed in parallel with 102) · **Spec:** §6.2 ("Anonymous User" strategy), §14 E12, §17.3 (resolved) · **Status:** ✅ Completed

## Why this exists as its own ticket

This isn't new Groups functionality — it's a **fix to an existing, already-shipped endpoint** (`/auth` account deletion) whose behavior silently changed as a side effect of TS-GRP-101. It doesn't fit TS-GRP-101 (schema-only) or TS-GRP-102 (`GroupService` — leaving/removing a member from *one* group, not deleting the whole account), and no other ticket touches `auth/service.py`. Called out explicitly so it isn't dropped.

## Scope

`AuthService.delete_user` ([auth/service.py:87-97](../../../varavu_selavu_app/varavu_selavu_service/auth/service.py)) currently does a bare `self.db.delete(user)`. Before TS-GRP-101, `ON DELETE CASCADE` on `expenses.user_email`/`expense_items.user_email` made that correct — deleting the user wiped their expenses for free. TS-GRP-101 changed those FKs to `ON DELETE SET NULL` (per the resolved "Anonymous User" strategy in §6.2/§17.3), so calling `delete_user` today:

- **Leaves personal expenses orphaned** (`user_email` → `NULL`, rows never deleted) instead of hard-deleting them, as the spec requires.
- **Leaves the real `display_name` exposed** on the user's `group_members` rows in any group, instead of rewriting it to `"Anonymous User"` as E12 requires.

This ticket closes that gap: update `delete_user` to perform the two required steps **before** deleting the `users` row (order matters — the FK `SET NULL` fires on the user row's actual deletion, so the explicit cleanup must happen first or in the same transaction).

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/auth/service.py` — `delete_user(email)`: before `self.db.delete(user)`, add:
  1. `self.db.query(Expense).filter(Expense.user_email == email, Expense.group_id.is_(None)).delete()` — hard-delete personal expenses. `expense_items` cascade for free via the existing `expense_id → expenses.id ON DELETE CASCADE`.
  2. `self.db.query(GroupMember).filter(GroupMember.user_email == email).update({"display_name": "Anonymous User"})` — anonymize display name in every group the user belonged to. (The `user_email` column itself will be nulled automatically by the FK's `ON DELETE SET NULL` when the `users` row is deleted immediately after.)
  3. Keep the existing `self.db.delete(user)` + commit as the final step; wrap all three in the existing try/except/rollback.
- No route changes — `auth/routers.py:171` already calls this method; behavior fix is contained to the service.

## Acceptance criteria

- Deleting an account with **no** group memberships behaves exactly as before (personal expenses gone, user gone) — no regression for solo users.
- Deleting an account that authored **group** expenses: those expenses and their `expense_splits`/`expense_payers` survive, with `expenses.user_email = NULL`.
- Deleting an account that has **personal** expenses (`group_id IS NULL`): those rows (and their `expense_items`) are actually removed from the database, not just orphaned.
- Every `group_members` row for that email, across every group, has `display_name == "Anonymous User"` and `user_email IS NULL` after deletion.
- `groups.created_by` / `settlements.created_by` referencing the deleted email are `NULL` (already handled by the FK — no code change needed, just verify).

## Dependencies

- **TS-GRP-101** (the `SET NULL` FK rework and `GroupMember`/`Expense.group_id` columns must exist first).

## Test requirements

- Extend `tests/test_auth.py` (or a new `tests/test_account_deletion.py`) using the shared `db_session`/`test_client` fixtures from `conftest.py`.
- Regression case: delete a user with only personal expenses → expenses table has zero rows for that email afterward (not just `user_email IS NULL`).
- Group case: user A authors a group expense with splits for A and B; delete A; assert the expense/splits/payers survive, A's `group_members.display_name == "Anonymous User"` in every group A belonged to, and A's personal expenses (if any, created in the same test) are gone.
- Mixed case: user with both personal and group expenses — assert personal ones are deleted and group ones survive anonymized, in the same call.
