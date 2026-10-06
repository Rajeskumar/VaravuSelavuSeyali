---
name: accessibility-review
description: Review UI changes for WCAG 2.2 AA — keyboard, focus, names, headings, forms/errors, dialogs, live regions, contrast, zoom/reflow, touch targets, and AI/chat accessibility. Use for "check accessibility", "is this accessible", or any UI change.
---

# Accessibility review

Scope: only your specialty — leave other domains to their reviewers. Standards (in `.ai-sdlc/standards/`): `accessibility.md`. Procedure and output: `.ai-sdlc/workflows/code-review.md`.

1. Determine the changed files/PR; read only the applicable standard sections.
2. Run the relevant deterministic check first if it exists (`scripts/quality/accessibility.sh [--axe]`).
3. Inspect the actual code before claiming anything; quote `file:line`.
4. Check:
   - Structure: one h1, heading order, route title, landmarks, skip link.
   - Names/roles: icon buttons, inputs, dialogs and sheets (`role="dialog"` + name), no nested interactives.
   - Forms: labels, `autoComplete`, `aria-invalid`/`aria-describedby`, announced errors, focus after failure.
   - Keyboard + focus: order, visible indicator, trap/Escape/return in overlays, hover-only actions.
   - Dynamic content: `role="log"/status/alert` for chat, saves, loading.
   - Contrast (light **and** dark), non-colour cues, 24/44px targets, 320px reflow, reduced motion; mobile: `accessibilityLabel/Role/State`.
   - Axe passing ≠ accessible: mark focus-order, announcement and meaning issues **Suspected** until verified.
5. Report findings in the shared format with P0–P3 and Confirmed / Suspected / Improvement; list what you did not check; give the verdict.

Format, severity and Confirmed/Suspected labelling: `.ai-sdlc/workflows/code-review.md` and `.ai-sdlc/README.md`. Read-only: report findings; change code only if the user asks for fixes.
