# TS-QA-104 — Release test coverage map and release test sheet

## Problem and outcome
UAT cases do not show which flows a UI test really covers, mobile has almost no UAT, and there is no single final release test.
Owner goal (2026-11-26): automation strong enough to catch bugs before a production release; the owner runs a manual smoke test every release.
Done for this step: a current coverage map and a release test sheet. Excluded: new automated tests, the drift check, release-gate wiring.

## Plan
Docs only: `docs/qa/10-coverage-map.md`, `docs/qa/11-release-test-sheet.md`, pointers in 04, 05 and 08, CHANGELOG, ROADMAP. Owner approved the step in conversation.

## Tests
| Scenario | AC IDs | Level / location | Expected |
|---|---|---|---|
| Routes in App.tsx are named in the map (redirect shims aside) | AC-001 | one-off script | none missing |
| Sheet step IDs and map references agree | AC-002 | one-off script | no unknown or unused IDs |

## Evidence
See evidence.json. No application tests were run; coverage statuses come from test titles, flow steps and file names.
