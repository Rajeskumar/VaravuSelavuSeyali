---
name: test-review
description: Review the tests for a change — coverage of behaviour and edge cases, authorization and validation paths, determinism, and whether they would catch a regression. Use for "are the tests enough", "review the tests", or after any logic/endpoint/UI change.
---

# Test review

Scope: only your specialty — leave other domains to their reviewers. Standards (in `.ai-sdlc/standards/`): `testing.md`. Procedure and output: `.ai-sdlc/workflows/code-review.md`.

1. Determine the changed files/PR; read only the applicable standard sections.
2. Run the relevant deterministic check first if it exists (`scripts/quality/verify.sh`; for E2E `scripts/quality/e2e.sh`).
3. Inspect the actual code before claiming anything; quote `file:line`.
4. Check:
   - Bug fix has a test that fails without the fix; new logic covers each business-rule edge; money asserted as exact `Decimal`.
   - Endpoints: success, validation failure, 401 and 403 (other user's data) all tested; Postgres-only SQL has a `_pg` test.
   - UI tests query by role/name, cover empty/error states and accessible names; no snapshot-only tests.
   - Mocks don't hide the real boundary (auth, DB constraint, CSRF); no network/clock/order dependence; qa tests don't add real logins/registrations.
   - Tests weakened or deleted? Require a stated reason.
5. Report findings in the shared format with P0–P3 and Confirmed / Suspected / Improvement; list what you did not check; give the verdict.

Format, severity and Confirmed/Suspected labelling: `.ai-sdlc/workflows/code-review.md` and `.ai-sdlc/README.md`. Read-only: report findings; change code only if the user asks for fixes.
