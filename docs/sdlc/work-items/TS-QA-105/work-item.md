# TS-QA-105 — Web group money journeys (backlog A1)

## Problem and outcome
No browser test saves a group expense through the UI, and group edit/delete/move/custom settlement are only covered below the UI
(`docs/qa/10-coverage-map.md`, W-14, 17, 21, 25..27, 29). Done: those journeys run in the `@regression` suite with server-side checks.
Excluded: product code changes (bugs are reported), mobile, group settings (A4), itemized receipt split (W-17, separate), settlement undo (no UI exists).

## Plan
New spec(s) under `qa/e2e/tests/groups/`, page actions in `qa/e2e/pages/GroupsPage.ts`, read helpers in `qa/e2e/helpers/api.helper.ts`.
Setup through the API, the action under test through the UI, assertions on stored data. Owner approved A1 in conversation (2026-11-26).

## Tests
| Scenario | AC IDs | Level / location | Expected |
|---|---|---|---|
| Members, splits, payers, capture | AC-001, AC-003 | Playwright, groups | stored shares exact |
| Edit, delete, undo, comment, settle, move, custom settlement | AC-002, AC-003 | Playwright, groups | stored data and balances exact |

## Evidence
See evidence.json. One implementation-review pass: no P0/P1; 5 P2 and the 3 confirmed P3 test gaps fixed (not re-reviewed). The suspected P3 was partly addressed (paged personal-expense check); dashboard before/after checks share the account and passed in the full run; the cookie-banner timing note is left.
Later: TS-FIX-101 fixed the split pre-fill bug and added its tests (these specs changed after this item's review). Originally the bug had no committed test, so the suite stays green until the fix adds a failing-first one. A reproduction was run outside the repository.
