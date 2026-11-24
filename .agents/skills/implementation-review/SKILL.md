---
name: implementation-review
description: Review code changes for correctness, regressions, structure, web/mobile parity, migration mechanics, test adequacy and (when routed) performance. Use for "review this code", "are the tests enough", "will this scale", or as the single code reviewer on any code change.
---

# Implementation review (code + tests + performance lens)

Input: the files listed for `implementation-review` by `scripts/quality/route-review.sh --json`
(its `focus` may include `performance`). Read-only; one pass over each file. Findings format,
severity and labels: `.ai-sdlc/workflows/code-review.md`.

1. Read the deterministic result first (`make check` summary or CI). Don't re-derive what a tool
   proved; don't re-run suites that already passed on this content.
2. Read only the standard sections you need: `architecture.md`, `backend.md`, `frontend.md`,
   `testing.md` (and `performance.md` when focused).
3. Inspect the actual code; quote `file:line` for every claim.

**Correctness and structure**
- Logic errors and edges: zero/negative/rounding, empty lists, removed members, archived groups,
  flag off, races, stale React Query data (`refreshExpenseViews`).
- Layering (no logic in routers), `Decimal` money, identity from the token, existing helpers reused
  (`PasswordField`, `SegmentedTabs`, `FormSheet`, `utils/money`), `todayIso()` for dates.
- Contract changes mirrored in both `src/api/*` layers, the spec and the other client (parity).
- Migrations: random-hex id, reversible, compatible with the deployed code, no long locks,
  idempotent backfill.
- Dead code, debug leftovers, comments that say *what* instead of *why*.

**Tests** (`test_integrity.py` already flags deleted tests, skips and assertion loss)
- A bug fix has a test that fails without the fix; each business-rule edge is covered; money is
  asserted as exact `Decimal`.
- Endpoints: success, validation failure, 401 and 403 (another user's data); Postgres-only SQL has a `_pg` test.
- UI tests query by role/name and cover empty/error states; no snapshot-only tests.
- Mocks don't hide the real boundary (auth, DB constraint, CSRF); no network/clock/order dependence;
  qa tests add no real logins/registrations.

**Performance** (only when `focus` includes `performance`)
- N+1, unbounded lists, missing pagination/limits or index for a new filter/sort, recompute per request.
- Heavy LLM/OCR work on the request path; web refetch loops, unbounded rendering, eager Plotly;
  mobile list virtualisation. Name the growth driver; measure before calling it a regression.

End with counts per severity, what you did not check, and the verdict. Change code only if asked.
