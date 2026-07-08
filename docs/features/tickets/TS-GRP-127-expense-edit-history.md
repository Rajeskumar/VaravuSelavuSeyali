# TS-GRP-127 — Per-expense edit history

**Phase:** 3 · **Spec:** §5.2 · **Status:** 📋 Planned

## Scope

Spec §5.2 lists "Edit history | Per-expense change log (who changed what)" as a distinct feature, implying a new table. **Recommend not building a second table.** `group_activity` (`db/models.py:228-241`) already has exactly the right shape — `entity_id` (the expense id), `action`, `actor_member_id`, `payload_json`, `created_at` — and **TS-GRP-119** (activity feed) is designed to write `expense_edited` rows with full `{old, new}` snapshots in `payload_json` specifically so this ticket doesn't need its own storage (see TS-GRP-119's scope note: *"Store enough in `payload_json` to power TS-GRP-127 (edit history) for free"*). This ticket is therefore purely a **read/presentation** layer on top of TS-GRP-119's writes.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — new `GET /{group_id}/expenses/{expense_id}/history` — filters `group_activity` by `entity_id == expense_id AND action IN ('expense_added', 'expense_edited', 'expense_deleted')`, ordered chronologically. Membership-gated.
- `varavu_selavu_app/varavu_selavu_service/services/activity_service.py` (from **TS-GRP-119**) — add a `get_expense_history(group_id, expense_id, actor_email)` method there rather than duplicating the query in the route handler.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — `ExpenseHistoryEntryDTO` (`action`, `actor_display_name`, `changed_fields: dict`, `created_at`) — derive `changed_fields` by diffing the `payload_json.old`/`payload_json.new` snapshots at read time (or store the diff pre-computed at write time in TS-GRP-119 — either is acceptable; computing at read time keeps TS-GRP-119 simpler and this ticket self-contained).
- **Web:** a "History" affordance on the group expense edit dialog (`GroupDetailPage.tsx`) — e.g. an expandable panel or a small "Edited 3 times" link opening a timeline.
- **Mobile:** equivalent on `GroupDetailScreen.tsx`'s expense detail/edit view.

## Acceptance criteria

- `GET /{group_id}/expenses/{expense_id}/history` returns every add/edit/delete event for that expense in order, with actor names and a human-readable diff (e.g. "amount: $30.00 → $27.00", "description: 'Dinner' → 'Dinner at Luigi's'").
- An expense with only its original `expense_added` event (never edited) returns a single-entry history, not an empty list.
- Non-member access → `403`.
- If a comparable event references a deleted/anonymized actor (**TS-GRP-112**'s "Anonymous User" strategy), the history still renders using the preserved `display_name` rather than erroring.

## Dependencies

- **TS-GRP-119** (activity feed writes this reads — hard dependency, this ticket cannot start until 119's `expense_edited` payload shape is finalized).

## Test requirements

- New `varavu_selavu_app/tests/test_expense_history.py`: single-edit and multi-edit timelines, correct diff computation, non-member `403`, anonymized-actor rendering.
