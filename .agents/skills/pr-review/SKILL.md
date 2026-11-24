---
name: pr-review
description: Review a PR, branch, diff or "my changes" and run only the reviewers the change needs. Use for "review this PR", "review my changes", "is this ready to merge", "check this before I merge". The single entry point for code review.
---

# PR review (router)

1. `scripts/quality/route-review.sh --json [base]` gives the tier, reviewers, per-reviewer file
   scopes and scope hashes, `focus` and check categories. Treat it as a baseline: escalate with
   `--risk high` or `--product` when behavior warrants; never drop a routed reviewer.
2. `make check` (summary output, logs in `.sdlc-logs/`). If checks fail, report them and stop:
   no AI review of code that doesn't pass its deterministic checks.
3. Skip a reviewer whose recorded evidence is still current (`sdlc.py gate` doesn't list it as
   stale; `make route` scope hashes show whether its files changed). Otherwise run each routed
   reviewer **once**:
   - Tier 1 (trivial): no reviewers — say so.
   - Tier 2: `implementation-review` (+ `ui-review` for UI files, + `product-review` only when the
     work item is a new user-facing feature or rule change, + `security-review` for endpoints).
   - Tier 3: add `security-review`.
   Claude Code: delegate to `code-reviewer`, `ui-reviewer`, `product-reviewer`, `security-reviewer`
   (independent ones in parallel), giving each only its file scope and `focus`. Codex/other tools:
   apply the skills in turn and disclose that it is self-review.
4. One consolidated report: findings P0→P3, de-duplicated (ownership in
   `.ai-sdlc/workflows/code-review.md`), checks and their results, what was not reviewed, verdict
   `PASS` / `PASS_WITH_APPROVED_WAIVERS` / `BLOCKED` / `INCOMPLETE_EVIDENCE`.
5. Fix loop: fix P0/P1, re-run only the affected checks and only reviewers whose scope changed.
   P2/P3 become follow-ups, not same-session loops. Two failed fix cycles → stop and report.
6. Release candidate? Use `release-readiness` instead of re-reviewing.
