---
name: product-review
description: Review a change against product intent — acceptance criteria, business rules in the spec, consistency of numbers across screens, scope, and missing states. Use for "does this meet the requirement", and when the work item is a new user-facing feature or a spec/business-rule change (requested, not path-routed).
---

# Product review

Requested by the work item or `--product` routing; read-only, your specialty only. Standards (in `.ai-sdlc/standards/`): `product.md` (+ the relevant `docs/features/` spec and `docs/TrackSpense_Complete_Product_Specification.md` section). Procedure and output: `.ai-sdlc/workflows/code-review.md`.

1. Read the work item's acceptance criteria and only the relevant spec section (grep; the spec is large).
2. Read deterministic results first (`make check` summary or CI).
3. Inspect the actual code before claiming anything; quote `file:line`.
4. Check:
   - Each acceptance criterion is met by observable behaviour; unhappy paths exist.
   - Business rules match the spec (group splits, settlement, Card Coach scope, budget pace, AI limits); no screen contradicts another's number.
   - Principles: one true number, AI never mutates beyond create, privacy defaults, flag gating, web↔mobile parity.
   - Scope creep, undocumented behaviour, missing spec/README/FEATURE_STATUS updates.
5. Report findings in the shared format with P0–P3 and Confirmed / Suspected / Improvement; list what you did not check; give the verdict.

Format, severity and Confirmed/Suspected labelling: `.ai-sdlc/workflows/code-review.md` and `.ai-sdlc/README.md`. Read-only: report findings; change code only if the user asks for fixes.
