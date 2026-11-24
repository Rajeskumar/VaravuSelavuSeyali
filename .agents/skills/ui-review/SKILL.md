---
name: ui-review
description: Review UI changes for WCAG 2.2 AA accessibility and UX — keyboard, focus, names, forms, dialogs, contrast, states, responsive and dark mode, copy. Use for "check accessibility", "review this screen/dialog/flow", or any new/changed web or mobile screen.
---

# UI review (accessibility + UX)

Input: the files listed for `ui-review` by `scripts/quality/route-review.sh --json`. Read-only;
one pass per file covering both sections. Findings format: `.ai-sdlc/workflows/code-review.md`.
Label each finding `[a11y]` or `[ux]`.

1. Read the deterministic results first: `scripts/quality/accessibility.sh [--axe]` for web
   (CI already runs axe on every push). Axe passing ≠ accessible.
2. Read only the sections you need of `accessibility.md` and `ux.md` (+ the matching section of
   `docs/design/TrackSpense_UX_Design_Spec.md`).
3. Inspect the actual code; quote `file:line`. Check the running app only when layout is the question.

**Accessibility (WCAG 2.2 AA)**
- Structure: one h1, heading order, route title (`RouteA11y.tsx`), landmarks, skip link.
- Names/roles: icon buttons, inputs, dialogs/sheets (`role="dialog"` + name), no nested interactives.
- Forms: labels, `autoComplete`, `aria-invalid`/`aria-describedby`, announced errors, focus after failure.
- Keyboard/focus: order, visible indicator, trap/Escape/return in overlays, no hover-only actions.
- Dynamic content: `role="log"/"status"/"alert"` for chat, saves, loading.
- Contrast in light **and** dark, non-colour cues, 24/44px targets, 320px reflow, reduced motion;
  mobile `accessibilityLabel/Role/State`. Focus order and announcements stay **Suspected** until verified.

**UX**
- Loading, empty, error, success and destructive-confirm states exist; copy is specific and actionable.
- Theme tokens and shared components; money in ink, colour only for state, sign + word not colour alone.
- 1440/768/390/320 widths, no horizontal scroll, sheets below the app bar, thumb-zone actions.
- Flow clarity: progressive disclosure, no competing totals, consistent with neighbouring screens.
- Mobile: native evidence needed; web axe is not a substitute.

End with counts per severity, what you did not check, and the verdict. Change code only if asked.
