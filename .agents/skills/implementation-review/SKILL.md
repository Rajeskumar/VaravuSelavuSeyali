---
name: implementation-review
description: Review code changes for correctness, structure, regressions, web/mobile parity and migration mechanics. Use for "review this code/PR", "does this look right", or as the first reviewer on any substantial code change.
---

# Implementation review

Scope: only your specialty — leave other domains to their reviewers. Standards (in `.ai-sdlc/standards/`): `architecture.md`, `backend.md`, `frontend.md`. Procedure and output: `.ai-sdlc/workflows/code-review.md`.

1. Determine the changed files/PR; read only the applicable standard sections.
2. Run the relevant deterministic check first if it exists (`scripts/quality/verify.sh`).
3. Inspect the actual code before claiming anything; quote `file:line`.
4. Check:
   - Logic errors, unhandled edge cases (zero/negative/rounding, empty lists, removed members, archived groups, flag off), race conditions, stale React Query data (`refreshExpenseViews`).
   - Layering violations, logic in routers, float money, client-supplied identity, duplicated helpers instead of existing ones (`PasswordField`, `SegmentedTabs`, `FormSheet`, `utils/money`).
   - Contract changes not mirrored in both `src/api/*` layers, the spec, or the other client.
   - Migrations: random-hex id, reversible, backward-compatible with the deployed code, no long locks, idempotent backfill.
   - Dead code, debug leftovers, comments that say *what* not *why*.
5. Report findings in the shared format with P0–P3 and Confirmed / Suspected / Improvement; list what you did not check; give the verdict.

Format, severity and Confirmed/Suspected labelling: `.ai-sdlc/workflows/code-review.md` and `.ai-sdlc/README.md`. Read-only: report findings; change code only if the user asks for fixes.
