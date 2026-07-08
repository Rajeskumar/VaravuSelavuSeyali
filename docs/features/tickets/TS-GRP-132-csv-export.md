# TS-GRP-132 — CSV export (group expenses + settlements)

**Phase:** 3 · **Spec:** §2.2 (Splitwise Pro parity: "CSV/JSON export") · **Status:** 📋 Planned

## Scope

Export a group's expense and settlement history to CSV — useful for trip cost-splitting reports, taxes, or migrating away from the app (the last of which is a trust signal worth having even if rarely used). Splitwise gates this behind Pro; product decision on monetization is out of scope for this ticket (build it free, matching the spec's own recommendation in §17 Q8 for itemized splitting — "free to drive adoption" — apply the same default posture unless told otherwise).

## Files it will touch

- **New:** `services/group_export_service.py` — `export_csv(group_id, actor_email) -> str` (or a streaming generator for large groups). Two logical sections in one CSV (or two separate downloadable files — pick one; recommend a single CSV with a `record_type` column (`expense`|`settlement`) discriminating rows, simplest for a spreadsheet import): expenses (date, description, category, amount, payer(s), each member's share) and settlements (date, from, to, amount, method, notes).
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — new `GET /{group_id}/export.csv` returning `text/csv` via FastAPI's `StreamingResponse` (check whether any existing endpoint in this codebase already returns a file/stream — if not, this is the first, so follow FastAPI's standard `StreamingResponse`/`Content-Disposition: attachment` pattern directly).
- Membership-gated (`require_membership`) — any member can export, not just admins (this is the member's own consumption history too).
- **Web:** an "Export CSV" button on `GroupDetailPage.tsx` (Settings tab from **TS-GRP-118**, or a header action) triggering a browser download.
- **Mobile:** an "Export" action on `GroupDetailScreen.tsx` invoking the OS share sheet with the CSV content (`expo-sharing` — check if already a dependency; if not, this is a new native dependency to add, similar in weight to how **TS-GRP-110** added `expo-notifications`/`expo-device`).

## Acceptance criteria

- Exported CSV opens cleanly in Excel/Google Sheets/Numbers with correct column headers, no encoding issues (UTF-8 with BOM if targeting Excel-on-Windows compatibility — verify, this is a common gotcha).
- All expenses and settlements in the group are included, correctly attributed (payer names, split amounts per member as separate columns or a summarized "my share" column — pick a layout, document it in the ticket's implementation).
- Non-member export attempt → `403`.
- Placeholder members render by their `display_name`, not a blank/null field.
- Large groups (hundreds of expenses) export without timing out — use a generator/streaming response rather than building the full CSV string in memory if row counts could plausibly exceed a few thousand (unlikely per §6.5's stated data-volume assumption of "hundreds of rows," but streaming costs little to build correctly from the start).

## Dependencies

- **TS-GRP-104** (group expenses), **TS-GRP-105** (settlements).

## Test requirements

- New `varavu_selavu_app/tests/test_group_export.py`: correct row counts, correct header schema, non-member `403`, placeholder-member name rendering, empty-group export (headers only, no crash).
