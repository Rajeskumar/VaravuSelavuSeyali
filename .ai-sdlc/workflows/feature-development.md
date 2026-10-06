# Feature development workflow

Scale the ceremony to the change. A one-line fix skips straight to implement + test + verify.

1. **Understand.** Restate the goal and acceptance criteria (observable outcomes incl. empty/error/permission cases). Read the spec section and `docs/features/` entry. If the criteria are ambiguous in a way that changes the design, ask once, then proceed on stated assumptions.
2. **Plan (required when** the change touches ≥3 files, any API/schema/contract, auth/permissions, money maths, a new screen, or both clients**).** Write a short plan: files, data/contract changes, flags, tests, both-client impact, risks. Get a yes before large or risky work.
3. **Implement** following `standards/{architecture,backend,frontend}.md`. Smallest change that satisfies the criteria; match surrounding code style and comment density (comments explain *why*).
4. **Test as you go** (`standards/testing.md`): unit for logic, API test incl. unauthorized/forbidden, RTL for UI, `_pg` test for Postgres-only SQL.
5. **Deterministic checks:** `scripts/quality/verify.sh` (area-aware). Fix before any AI review.
6. **Self-review the diff** against `checklists/definition-of-done.md`; delete debug code; check web↔mobile parity.
7. **Routed reviews:** `scripts/quality/route-review.sh` → run only the reviewers it lists (`workflows/code-review.md`). Fix P0/P1, then re-run only the reviewers that raised them.
8. **Full checks** (`verify.sh --full`), docs (README/spec if user-facing or contract change), `CHANGELOG.md` line, AGENTS.md Key Decision if a new pattern.
9. **PR readiness:** `checklists/pr-checklist.md`. Leave changes uncommitted unless asked; one commit per logical item; never push without asking.
10. **Release candidates:** `workflows/release-review.md`.
