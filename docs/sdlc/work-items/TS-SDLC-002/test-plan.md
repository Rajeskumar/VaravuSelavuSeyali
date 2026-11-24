# Test specification — TS-SDLC-002

| Scenario | AC | Level / location | Expected |
|---|---|---|---|
| Golden routing cases (UI standard, money/auth high, tests-only, docs trivial, scratch excluded) | AC-001 | `tests/test_routing.py` | Tiers/reviewers as specified |
| Replay Nov-2026 commits | AC-001 | routing-replay evidence | Far fewer than 33/40 high; max 3 reviewers |
| Codex agents generated and in sync; routing names map to agents/skills | AC-002 | `validate-ai-sdlc.py` | 0 errors |
| Failure excerpt bounded; logs to file | AC-003 | `tests/test_verification.py` | ≤ 20 lines, pattern lines first |
| Guard allow/ask/deny matrix incl. heredoc, Codex deny, approval prefix | AC-004 | `tests/test_guard_bash.py` | As specified |
| Deleted test, skip/only, assertion loss, rename, untracked | AC-005 | `tests/test_test_integrity.py` | Flagged / not flagged |
| CI jobs present; ruleset matches job names; rehearsal from v1.1.0 | AC-006 | `tests/test_configuration.py`, local rehearsal | Pass |
| Record building, component evaluation, trigger filter, waivers | AC-007, AC-010 | `tests/test_release_tools.py`, `tests/test_artifacts.py` | Pass |
| AGENTS.md budget, nested imports | AC-008 | validator | 0 errors |
| Usage parsing without content; routing evals | AC-009 | `tests/test_usage_report.py`, `tests/test_evals.py` | Pass |
