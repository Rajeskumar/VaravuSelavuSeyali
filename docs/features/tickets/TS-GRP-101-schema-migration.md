# TS-GRP-101 — ORM models + Alembic migration

**Phase:** 1 · **Build order:** 2nd · **Spec:** §6.1, §6.2, §6.3, §13

## Scope

Add the Groups data model as **SQLAlchemy ORM classes** in `db/models.py` and an **Alembic migration** — *not* hand-written `schema.sql` (that file is a stale reference doc; the live schema is `Base.metadata` + Alembic, per §6). All new columns/types must be **portable** so the SQLite test path (`Base.metadata.create_all`) still works.

New tables (Phase 1 subset): `groups`, `group_members`, `group_invitations`, `expense_payers`, `expense_splits`, `settlements`, `group_activity`.
Altered table: `expenses` gains nullable `group_id` + `split_type`.

**Deferred to their own tickets / phases (do NOT create here):**
- `device_tokens` → TS-GRP-110.
- `expense_item_splits`, `recurring_templates.group_id/split_config` → Phase 2.

### Required non-additive change (blocks E12)

Rework the `expenses.user_email` **and** `expense_items.user_email` FKs so account deletion cannot destroy group history. Today both are `ForeignKey("trackspense.users.email", ondelete="CASCADE")` (`db/models.py:27`, `:50`). Per §6.2 / §14 E12, group-scoped rows must survive an author's account deletion. Implement the agreed approach (recommended: make the column nullable + `ON DELETE SET NULL`, or repoint group rows to a retained sentinel; personal rows may still hard-delete). This is an explicit constraint change in the migration, not additive.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/db/models.py` — new model classes; edit `Expense` (add `group_id`, `split_type`; rework `user_email` FK) and `ExpenseItem` (rework `user_email` FK). Follow existing conventions: `UUID(as_uuid=True), default=uuid.uuid4`, `Numeric(12,2)`, `DateTime(timezone=True)`, SQLAlchemy `JSON` (**not** `JSONB`), `__table_args__ = {"schema": "trackspense"}` (or `(UniqueConstraint(...), {"schema": "trackspense"})`).
- **New Alembic migration:** `varavu_selavu_app/alembic/versions/<hash>_groups_phase1.py` via `alembic revision --autogenerate -m "groups phase 1"` then hand-review. `alembic/env.py` already sets `include_schemas=True` / `version_table_schema="trackspense"`, so autogenerate emits `trackspense.*` correctly.
- Add indexes from §6.3 that apply to Phase 1 tables: `idx_expenses_group_id`, `idx_group_members_user_email`, `idx_expense_splits_member_id`, `idx_expense_payers_member_id`, `idx_settlements_group_id`, `idx_group_activity_group_id_created` (declare via `index=True` / `Index(...)` in the models so autogenerate picks them up).
- *(Optional, doc hygiene)* `varavu_selavu_app/varavu_selavu_service/db/schema.sql` — append the new tables to keep the reference readable; explicitly NOT the source of truth.

## Acceptance criteria

- `alembic upgrade head` applies cleanly on Postgres; `alembic downgrade` reverses it.
- `Base.metadata.create_all(bind=engine)` succeeds on **SQLite in-memory** (verified by the test suite booting) — no `JSONB`/`gen_random_uuid()`/`TIMESTAMPTZ` literals that break SQLite.
- FK/unique constraints match §6.1: `group_members UNIQUE(group_id, user_email)`, `expense_payers UNIQUE(expense_id, member_id)`, `expense_splits UNIQUE(expense_id, member_id)`, `settlements CHECK(from_member_id <> to_member_id)`, `group_invitations.token UNIQUE`.
- `expenses.group_id` and `split_type` are nullable; all existing rows are unaffected (still personal).
- Account-deletion FK rework in place: deleting a user with authored **group** expenses does not cascade-delete those expenses / their splits / payers (E12 holds). Covered by a test.
- `groups.created_by` and `settlements.created_by` both FK → `users(email)`.

## Dependencies

- **None** to start, but its schema is consumed by TS-GRP-102/104/105/106. Can run in parallel with TS-GRP-103.

## Test requirements

- Extend `tests/conftest.py` only if new models need importing for `create_all` (they are picked up automatically if defined in `db/models.py`).
- New `tests/test_groups_schema.py` (SQLite): create a group + members + a group expense with splits/payers; assert unique constraints and the `from != to` settlement check raise on violation.
- E12 regression test: create user A, a group, a group expense authored by A with splits for A and B; delete user A; assert the group expense, its `expense_splits`, and `expense_payers` still exist and A's `group_members` row is now a placeholder (`user_email IS NULL`).
- PG parity: add the same scenario to the `run_e2e_pg_tests.sh` suite (`tests/test_analytics_e2e_pg.py` is the existing PG-marked example to mirror) so the CASCADE rework is verified on real Postgres FK semantics.
