---
name: performance-review
description: Review performance and scalability — queries, N+1, pagination, aggregation, render cost, bundle/chart weight, background work. Use for "will this scale", "is this slow", and changes to analytics/insight/balance/export code, list endpoints, charts or heavy screens.
---

# Performance review

Scope: only your specialty — leave other domains to their reviewers. Standards (in `.ai-sdlc/standards/`): `performance.md`. Procedure and output: `.ai-sdlc/workflows/code-review.md`.

1. Determine the changed files/PR; read only the applicable standard sections.
2. Run the relevant deterministic check first if it exists (see the standard).
3. Inspect the actual code before claiming anything; quote `file:line`.
4. Check:
   - Query shape: N+1, unbounded lists, missing pagination/limits, missing index for new filter/sort columns, recompute-per-request instead of pre-aggregation.
   - Request path: LLM/OCR/heavy work not done synchronously when a deterministic tier or `BackgroundTasks` fits.
   - Web: over-invalidation/refetch loops, unbounded row rendering, eager Plotly/overlay mounts, missing debounce, layout shift.
   - Mobile: virtualised lists, JS-thread work during gestures.
   - Quote the growth driver (rows × members × months) and measure (EXPLAIN, profiler) before claiming a regression.
5. Report findings in the shared format with P0–P3 and Confirmed / Suspected / Improvement; list what you did not check; give the verdict.

Format, severity and Confirmed/Suspected labelling: `.ai-sdlc/workflows/code-review.md` and `.ai-sdlc/README.md`. Read-only: report findings; change code only if the user asks for fixes.
