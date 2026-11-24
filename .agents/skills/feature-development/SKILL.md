---
name: feature-development
description: Implement a feature, change or bug fix in TrackSpense through Discover, Plan, Build and Validate, with Deploy only when authorized. Use for implement, add, build, fix or change behavior. Skip pure Q&A and planning-only requests.
---

Entry: `.ai-sdlc/lifecycle.md` (phases, tiers, authorization). Read only the active phase workflow
(`.ai-sdlc/workflows/<phase>.md`) and the standards it needs. Reuse approved requirements/plans and
the user's existing authorization; ask only for material product changes or separately authorized
actions. Never commit/push unless asked; never weaken tests or bypass gates.

**Size the process to the tier** (`scripts/quality/route-review.sh` gives the baseline):
- Trivial: no record; concise scope/check notes; `make check`.
- Standard: `sdlc.py init TS-… --light` (one `work-item.md` + ACs/evidence JSON).
- High: full record, plan fingerprint and recorded authorization.

**Feature:** Discover (if needed) → Plan → Build → Validate.
**Bug fix (condensed):** reproduce and state expected vs actual → root cause, sibling/client impact,
minimal fix → a test that fails for the behavioral reason → fix → focused checks → Validate.
Urgency is emergency mode, never a lower risk tier.

**Build/Validate loop:** focused tests while coding; then `make check` once (summary only; open the
failing log section, not the whole log); then `pr-review` routing (one pass per routed reviewer).
Re-run only affected checks and reviewers after a fix; two failed cycles → stop and report.
Long sessions are the main token cost: one session per work item or phase; read large files by
section; screenshots only when layout is the question.

**Done:** applicable definition of done (`.ai-sdlc/checklists/definition-of-done.md`), docs per
AGENTS.md, evidence recorded. Validated is not deployed; Deploy needs separate authorization.

Board tracking (queue/pick up/status mirror) follows `.ai-sdlc/lifecycle.md` "Work tracking"; that standing authorization is the only external write allowed without a new ask.
