---
name: feature-development
description: Implement a feature, change or bug fix in TrackSpense through Discover, Plan, Build and Validate, with Deploy only when authorized. Use for implement, add, build, fix or change behavior. Skip pure Q&A and planning-only requests.
---

Follow `.ai-sdlc/lifecycle.md` and `.ai-sdlc/workflows/feature-development.md`; bugs also use
`.ai-sdlc/workflows/bug-fix.md`. Read only the active phase and applicable engineering standards.
Reuse approved requirements/plans and actual user authorization; resolve missing prerequisites within
scope. Create proportional artifacts in `docs/sdlc/`, run required checks/reviews, fix authorized defects
within the bounded remediation policy, and update current product docs/changelog as AGENTS.md requires.
Do not infer deployment authorization from implementation or validation requests. Leave changes
uncommitted unless explicitly asked. Never weaken tests or bypass gates to finish.

Board tracking (queue/pick up/status mirror) follows `.ai-sdlc/lifecycle.md` "Work tracking"; that standing authorization is the only external write allowed without a new ask.
