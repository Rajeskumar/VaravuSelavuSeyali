# Test specification

Requirements: requirements.md; AC text: work-item.json. Levels: U = Jest/pytest unit, S = script/negative check, D = device E2E (Maestro), C = CI.

| Scenario ID | AC IDs | Preconditions / fixture | Action | Expected outcome | Level / location |
|---|---|---|---|---|---|
| T-001 | AC-001 | prod build, override env set | `getApiBaseUrl()` | override ignored, prod URL | U `baseUrl.test.ts` |
| T-002 | AC-001 | e2e variant + local URL | `getApiBaseUrl()` | override used | U `baseUrl.test.ts` |
| T-003 | AC-001 | e2e build with `https://<prod-host>` or no URL | run build script | refused, non-zero | S build script |
| T-004 | AC-001 | production profile + `APP_VARIANT=e2e` | release prepare / config | refused | S + U |
| T-005 | AC-001 | built artifact modified after build | run.sh | hash mismatch refused | S |
| T-006 | AC-002 | non-local or non-`trackspense_e2e_*` DATABASE_URL | start-test-backend.sh | refuses before bootstrap | S |
| T-007 | AC-002 | real `.env` present with secrets | start backend | startup log shows explicit blank/test values; no AI/mail | S |
| T-008 | AC-003, AC-004 | seeded user | login, kill, relaunch | session restored; bad password error | D smoke |
| T-009 | AC-003, AC-004 | seeded user | add expense | exactly one row via API by label; screens refresh | D smoke |
| T-010 | AC-003, AC-004 | seeded user | type draft, kill app, relaunch | draft restored; API count unchanged until Save | D smoke |
| T-011 | AC-003, AC-004 | seeded user | open each tab | key element visible on each | D smoke |
| T-012 | AC-003, AC-004 | seeded group + name-only member | add equal-split group expense | split and viewer balance match API | D smoke |
| T-013 | AC-003, AC-004 | any flow | run alone and in shuffled order | all pass (no order coupling) | D + C |
| T-014 | AC-005 | fault-proxy drops response after commit | save expense | pending/unknown shown, no resubmit, exactly one row | D regression |
| T-015 | AC-005 | users A and B | logout A, login B | no A data or draft visible | D regression |
| T-016 | AC-005 | receipt fixture via addMedia | scan | proxy log shows parse_ocr text lines, no image upload | D regression |
| T-017 | AC-005 | join token | openLink signed-in / signed-out | join screen / documented resume behavior (parity gap reported) | D regression |
| T-018 | AC-006 | PR touching docs only | workflow | gate passes as N/A | C |
| T-019 | AC-006 | one platform job cancelled or skipped | workflow | gate fails | C |
| T-020 | AC-007 | candidate SHA with smoke-only / one-platform / cancelled / schedule-only runs | release-gate | rejected | U `scripts/quality/tests` |
| T-021 | AC-008 | docs and standards | framework-check, test_configuration | consistent, B-19 not marked done without CI link | S + U |

Manual: none for in-scope; excluded items stay in docs/qa/08. Exact results go in evidence.json during Validate.
