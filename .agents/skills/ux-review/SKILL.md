---
name: ux-review
description: Review UI changes for usability, visual consistency, states, responsive and dark-mode behaviour, and copy. Use for "review this page/dialog/flow for UX", "does this look right on mobile", or any new/changed screen. WCAG issues belong to accessibility-review.
---

# Ux review

Scope: only your specialty — leave other domains to their reviewers. Standards (in `.ai-sdlc/standards/`): `ux.md` (+ the matching section of `docs/design/TrackSpense_UX_Design_Spec.md`). Procedure and output: `.ai-sdlc/workflows/code-review.md`.

1. Determine the changed files/PR; read only the applicable standard sections.
2. Run the relevant deterministic check first if it exists (see the standard).
3. Inspect the actual code before claiming anything; quote `file:line`.
4. Check:
   - Loading, empty, error, success and destructive-confirm states all designed; copy is specific and actionable.
   - Uses theme tokens and shared components; money in ink, colour only for state, sign+word not colour alone.
   - Light and dark; 1440/768/390/320 widths; no horizontal scroll; sheets below the app bar; thumb-zone actions.
   - Flow clarity: progressive disclosure, no competing totals, consistent patterns with neighbouring screens.
   - Check in the running app when available (browser preview); label what is a UX defect vs an improvement.
5. Report findings in the shared format with P0–P3 and Confirmed / Suspected / Improvement; list what you did not check; give the verdict.

Format, severity and Confirmed/Suspected labelling: `.ai-sdlc/workflows/code-review.md` and `.ai-sdlc/README.md`. Read-only: report findings; change code only if the user asks for fixes.
