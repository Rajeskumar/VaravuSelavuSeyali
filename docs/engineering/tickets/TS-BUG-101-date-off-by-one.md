# TS-BUG-101 — Expense date off-by-one on receipt-scan / itemized create

**Status:** ✅ Fixed · **Severity:** P0 (reported) → confirmed scoped to one flow

## Reported symptoms

1. Dates stored one day early on write — POST an expense dated `07/15/2026`, GET it back, see `07/14/2026`.
2. Editing an expense (even touching only unrelated fields) shifts the date back one further day on every save, compounding.

## Investigation summary

Exhaustive testing of the plain expense path — `POST /expenses` → `ExpenseService.add_expense`, `PUT /expenses/{id}` → `ExpenseService.update_expense`, and the equivalent group-expense path (`GroupExpenseService`) — found **no bug**. All three were verified clean via direct service calls against real Postgres, a full FastAPI `TestClient` HTTP round trip, and a live two-edit browser cycle (create → edit cost only → reload → edit cost only again, date held at `07/15/2026` throughout). Every write on these paths anchors to noon UTC (`datetime.strptime(date_str, "%m/%d/%Y").replace(hour=12, tzinfo=timezone.utc)`, established in `227db5b`), which cannot roll across a day boundary for any real-world timezone offset.

The actual bug is in a different, unaudited path: **`POST /expenses/with_items`** (receipt-scan / itemized expense creation), which bypasses `ExpenseService` entirely and writes through `PostgresRepo.append_expense` — a second, independent implementation of date handling that didn't share the safe anchor.

### Root cause (two independent bugs stacked in one flow)

1. **Backend — `varavu_selavu_service/repo/postgres_repo.py`, `append_expense`.** The old code treated any string `datetime.fromisoformat()` could parse as "already correctly timezone-aware" and stored it verbatim:
   ```python
   has_purchased_tz = False
   if isinstance(purchased_at, str):
       try:
           purchased_at = datetime.fromisoformat(purchased_at.replace("Z", "+00:00"))
           has_purchased_tz = True   # true just because parsing succeeded
       except ValueError:
           pass
   ```
   A full ISO datetime with a real offset (e.g. from a client's `Date.toISOString()`) can encode a calendar date that's already been shifted by local→UTC conversion. For a user in a positive UTC offset, local midnight converts to the *previous* UTC day; that string parses successfully, `has_purchased_tz` is set, and the shifted day is stored as-is.

2. **Mobile — `varavu_selavu_mobile/src/screens/AddExpenseScreen.tsx`, receipt-scan flow, two separate spots:**
   - OCR autofill (`applyParseResult`): `new Date(hdr.purchased_at)` on a bare `"YYYY-MM-DD"` string from the receipt parser is parsed as **UTC midnight** (the standard JS `Date` pitfall). Reading it back via local getters (`startOfDay`'s `setHours(0,0,0,0)`) rolls it back a calendar day in any **negative**-UTC-offset timezone (all of the Americas) — before the value ever reaches the network.
   - Save payload (`handleSave`, itemized branch): sent `purchased_at: expenseDate.toISOString()`, which re-introduces the same UTC-conversion problem for **positive**-offset users, feeding bug #1 above. Notably inconsistent with the plain (non-itemized) branch three lines below it, which already used the safe `date: formatMMDDYYYY(expenseDate)`.

   Web's equivalent OCR autofill (`QuickCaptureSheet.tsx`, `AddExpenseForm.tsx`) already avoided the parse pitfall via `hdr.purchased_at.split('T')[0]` (string-only), and its save payload already sent `purchased_at: formattedDate` (`MM/DD/YYYY` string, via `isoToMMDDYYYY`) — web was not affected by either bug.

Net effect: the itemized/receipt-scan flow could roll a date back a day on the way into the form (mobile, negative offset) and/or on the way into storage (either client, positive offset), depending on the user's timezone — which is exactly why direct reproduction attempts against the plain create/edit path, run from a negative-offset dev environment, didn't surface it.

**Symptom #2 (edit compounding) was not reproduced and is out of scope for this fix.** There is no PUT/PATCH endpoint for itemized expenses — editing any expense, however it was created, goes through `ExpenseService.update_expense`, which was proven idempotent. Left for a separate investigation if it recurs.

### Existing data

Checked local dev Postgres only (no prod access). No itemized-split-type rows exist there, so the bug's real-world footprint can't be measured locally — the same check should be run against prod, filtered to `split_type = 'itemized'`. Pre-existing off-noon-anchor rows found locally all predate the `227db5b` fix (midnight-UTC anchor, not this bug) and are unrelated.

## Fix

Treat the receipt-scan/itemized path the same way the already-safe paths do: a timezone-naive calendar date, anchored to noon UTC, with any incoming time-of-day/offset discarded rather than trusted.

- `PostgresRepo.append_expense` now normalizes `purchased_at` through a new `_normalize_purchased_at` helper: takes the date portion only (before any `T`), tries `%Y-%m-%d` then `%m/%d/%Y`, and anchors to noon UTC — mirroring `ExpenseService`'s existing pattern. `date`/`datetime` inputs are re-anchored the same way rather than trusted as-is.
- Mobile `AddExpenseScreen.tsx`:
  - OCR autofill now parses the `YYYY-MM-DD` string directly into y/m/d components and builds the `Date` via the safe local-time numeric constructor (`new Date(y, m-1, d)`) instead of `new Date(dateString)`.
  - The itemized save payload now sends `formatMMDDYYYY(expenseDate)` instead of `expenseDate.toISOString()`, matching the plain-expense branch in the same function.

No schema change — the existing `TIMESTAMPTZ` column plus a consistent noon-UTC anchor across every write path is sufficient; the bug was inconsistent anchoring between two independent implementations, not the column type.

## Files touched

- `varavu_selavu_app/varavu_selavu_service/repo/postgres_repo.py`
- `varavu_selavu_mobile/src/screens/AddExpenseScreen.tsx`

## Test requirements

- `varavu_selavu_app/tests/test_budgets_api.py`-style HTTP test via `POST /expenses/with_items`: create with a known date, read back (via `GET /expenses` or the fingerprint lookup), assert unchanged.
- Same, with `purchased_at` sent as a full ISO datetime carrying a positive UTC offset artifact (simulating a `toISOString()` client) — assert the stored calendar date matches the intended day, not the UTC-shifted one.
- Unit coverage for `PostgresRepo._normalize_purchased_at` directly: `YYYY-MM-DD`, `MM/DD/YYYY`, `YYYY-MM-DDTHH:MM:SSZ`, bare `datetime`/`date` objects, and `None`.
