# Framework test specification

| Scenario | AC IDs | Action | Expected result | Level |
|---|---|---|---|---|
| T-01 | AC-004 | Route small money, OAuth/MCP, nested Dockerfile, models and API paths | Appropriate baseline/security/product reviewers | Python unit |
| T-02 | AC-002, AC-003 | Validate malformed/duplicate records, skipped/failed/missing/stale checks | Errors or blocked/incomplete; never pass | Python unit |
| T-03 | AC-003 | Change source/plan after evidence/approval; edit only ledger | Source changes invalidate; ledger edit avoids circular hash | Temporary Git repo |
| T-04 | AC-003 | Accept P0 or expired P1; mark fix without verification | Block/incomplete; current non-P0 waiver explicit | Python unit |
| T-05 | AC-005 | Plan fast/integration/release/production commands | Scope correct; production only read-only smoke | Python unit |
| T-06 | AC-006 | Feed wrong SHA/branch/event, pending/newer-failed CI runs | Fail closed; require all three workflows | Python unit |
| T-07 | AC-006, AC-007 | Complete builds without serving versions/smoke, one component fails | Incomplete/blocked until both verified | Python unit |
| T-08 | AC-005, AC-006 | Parse YAML and shell; inspect first Cloud Build step | CI gate before any deployment side effects | Configuration tests |
| T-09 | AC-001, AC-008 | Exercise .ai-sdlc/evaluations.md prompts read-only | Respect phase/authorization boundaries | Independent agent evaluation |
| T-10 | AC-001..008 | Review diff against requirements/implementation/test/security | Findings owned and verified; limitations reported | Review |

Prior audit demonstrated routing omissions with real explicit-file probes. Initial new-module test run
failed because the module did not yet exist: that is scaffolding evidence, not claimed behavioral TDD.
Regression tests now assert the corrected routing/gate behaviors. Native/live-deploy tests are excluded
because this change neither modifies app behavior nor authorizes live deployment.
