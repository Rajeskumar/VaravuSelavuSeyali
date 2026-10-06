# Accessibility standard — WCAG 2.2 AA (web), native a11y props (mobile)

Target is AA. The web app has had a full pass (2026-10-06); these rules keep it there.

## Must-haves (web)
- **Structure:** exactly one `<h1>` per routed page (visible Typography `component="h1"`, else `PageHeading`); no skipped heading levels; one `<main id="main-content">`; skip link present; page title per route in `RouteA11y.tsx`; focus moves to the `<h1>` on route change.
- **Names:** every control has an accessible name; icon-only buttons need `aria-label` (capitalised verb, e.g. "Close"); no `role="button"` containers holding real buttons — use the stretched-button pattern (`ExpenseRow`).
- **Overlays:** every Dialog and Drawer sheet is named (`DialogTitle`, or `PaperProps['aria-label']`) and Drawers also pass `role="dialog"` + `aria-modal`. Focus is trapped, Escape closes, focus returns to the trigger.
- **Forms:** visible label (not placeholder-only), `autoComplete`, required/format instructions as helper text linked by `aria-describedby`; errors appear as text, set `aria-invalid`, and are announced (`role="alert"`); focus goes to the first invalid field or the alert after a failed submit.
- **Live regions:** async results (chat answers, save confirmations) via `role="log"|"status"|"alert"`; loading states are announced.
- **Keyboard:** everything operable by keyboard in a logical order; visible focus (theme sets 2px outline — never `outline: none` without a replacement); no keyboard traps; hover-only actions are also reachable on focus.
- **Colour/contrast:** text ≥ 4.5:1 (3:1 large/UI/graphics) in light **and** dark; never meaning by colour alone; charts have a text alternative or data table.
- **Targets and reflow:** targets ≥ 24px (44px on touch); reflow at 320px, 200% zoom; viewport meta must not block zoom.
- **Motion:** honour `prefers-reduced-motion`.

## Mobile (React Native)
`accessibilityLabel`/`accessibilityRole`/`accessibilityState` on touchables, announced errors (`accessibilityLiveRegion` / `AccessibilityInfo.announceForAccessibility`), 44pt targets, dynamic type tolerant layouts, labelled form inputs.

## Evidence
Run `scripts/quality/accessibility.sh` first (eslint jsx-a11y, jsdom tests, optional axe scan). Axe cannot judge focus order, announcements or meaning — those need code/ARIA inspection or a screen-reader pass (VoiceOver/NVDA); report them as **Suspected** until verified.
