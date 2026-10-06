---
name: feature-development
description: Implement a feature, change or bug fix in TrackSpense following the project lifecycle (criteria, plan, implement, tests, checks, routed reviews). Use for requests like "implement this", "add", "build", "fix this bug", "change how X works" that modify code. Skip for pure Q&A or review-only requests.
---

# Feature development

Follow `.ai-sdlc/workflows/feature-development.md` (bug fixes: `.ai-sdlc/workflows/bug-fix.md`). Read only the standards the change touches: `architecture.md` always; then `backend.md` / `frontend.md`; `testing.md` for tests.

1. State acceptance criteria (incl. empty/error/permission cases). Ask only if ambiguity changes the design.
2. **Plan first** (and get a yes) when the change spans ≥3 files, touches an API/schema/contract, auth/permissions, money maths, a new screen, or both clients. Otherwise just do it.
3. Implement minimally in the surrounding style. Check web↔mobile parity and feature-flag gating.
4. Write tests with the change (failing-first for bugs). Money assertions are exact `Decimal`.
5. Run `scripts/quality/verify.sh`, fix, then self-review against `.ai-sdlc/checklists/definition-of-done.md` (only the relevant lines).
6. Run `scripts/quality/route-review.sh`; run only the reviewers it names (see the `pr-review` skill). Fix P0/P1.
7. Finish: `CHANGELOG.md` line; AGENTS.md Key Decision only for new patterns; spec/README if user-facing or contract changed. Do not commit or push unless asked.

Don't: refactor unrelated code, weaken tests, bypass hooks, or invoke reviewers for trivial changes (typos, copy, comments).
