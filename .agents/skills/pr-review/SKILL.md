---
name: pr-review
description: Review a PR, branch, diff or "my changes" and decide which specialised reviewers apply. Use for "review this PR", "review my changes", "is this ready to merge", "check this before I merge". Routes by changed files so only relevant reviewers run.
---

# PR review (router)

1. Run `scripts/quality/route-review.sh [base]` — it lists the reviewers and deterministic checks for this diff. Don't add reviewers it didn't list unless the diff clearly warrants it.
2. Run the listed deterministic checks first (`scripts/quality/verify.sh`, `accessibility.sh`, `security.sh`) and note failures; don't re-derive what tools prove.
3. Run the listed reviewers in this order, passing earlier findings forward so nothing is duplicated: `implementation-review` → `product-review` → `test-review` → `security-review` → `accessibility-review` → `ux-review` → `performance-review`.
   - Claude Code: delegate each to its subagent (`implementation-reviewer`, `product-reviewer`, …); independent ones (security, accessibility, ux, performance) may run in parallel.
   - Codex / other agents: apply each reviewer skill in turn.
4. Merge into one report: findings by severity (P0→P3, de-duplicated, each owned by one reviewer), checks run and their results, anything not reviewed, and a verdict: `No blockers` / `Fix P1s first` / `Blocked (P0)`.
5. Release candidate? Hand off to `release-readiness` instead of re-reviewing.

Trivial diffs (typos, docs, copy) get deterministic checks only — say so rather than inventing a review.
