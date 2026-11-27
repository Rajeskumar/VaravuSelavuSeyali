# Work item (standard/trivial risk)

Acceptance criteria and required evidence: work-item.json. High risk uses the full record instead.

## Problem and outcome
What is wrong or missing, for whom, and what "done" looks like. Note exclusions.

## Plan
Approach, affected areas (web/mobile parity), risks and the files you expect to touch.

## Tests
| Scenario | AC IDs | Level / location | Expected |
|---|---|---|---|

## Evidence
Link CI runs or `make check` summaries; record results in evidence.json (add `scope` to keep a
check current while unrelated files change).

## Resume notes (2026-11-26)
- Six flows written under `qa/mobile/flows/regression/` with `qa/mobile/scripts/flow_checks.py`. None has passed; five have not run.
- `expense-edit-delete`: reaches the edit sheet and types 14.75; after tapping Save Changes the sheet stays open and the backend log shows no PUT. Product bug vs flow/tap problem not established. Its `.*14\.75.*` wait also matches the input itself and must be replaced.
- Port 18080 was held by the sibling template repo's E2E run. Use `E2E_API_PORT=18180 E2E_BACKEND_PORT=18181 E2E_CONTROL_PORT=18182`; after changing the port delete `$TMPDIR/metro-cache` before rebuilding, or the old URL stays in the bundle.
- Run one flow with `make mobile-e2e-ios SUITE=regression FLOW=<name>`. Do not run while another simulator suite is active (load average reached ~578).
- To verify (read from code only): on Group detail, "Settle up" when only others owe the viewer opens the sheet with no payer/payee.

### 2026-11-27 results (iOS 27 simulator, local tree, not CI)
- Passed: expense-edit-delete, recurring-run-edit (UI + stored data). Earlier "Save sends nothing" was the number pad still open (test fixed by tapping a label).
- Failing on product bugs (ROADMAP): settle-up (P0 wrong direction), group-expense-edit-delete (PUT 400), expense-move-group (200, list stale). Keep as failing-first tests.
- group-split-exact: test selector problem (split chip is off screen in the horizontal chip row); not yet fixed.
- Android not run.

## 2026-11-27 after TS-FIX-103
The product bugs the flows exposed are fixed in TS-FIX-103. Test fixes: the split flow swipes the chip row; settle-up group names no longer prefix each other; expense edit taps Save with the number pad open.
