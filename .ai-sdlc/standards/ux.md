# UX standard

Source: `docs/design/TrackSpense_UX_Design_Spec.md` (read the relevant section, not the whole file). Review UX only for screens the change touches.

## Principles (condensed)
1. **One true number, many lenses** — a headline amount plus a lens switch, not parallel totals.
2. **Numbers are the product; colour is punctuation** — money is ink by default; green/red only for direction/state (owed/owe/over budget); ember is rationed. Never encode owe/owed by colour alone — pair with sign and a word.
3. **Feeds and receipts, not grids** — day-grouped ledger rows; row = target; progressive disclosure row → detail sheet → full edit.
4. **Chat is a layer, not a room** — Ask opens over any screen, carrying scope.
5. **Spend boldness once** — restrained palette, motion and elevation.

## Required states (every data view and form)
Loading (skeleton/spinner, not blank), **empty** (explains what and offers the action — `EmptyState`), **error** (what failed + retry, no raw server text), partial/offline, success confirmation, destructive confirmation (`ConfirmDialog`), disabled-with-reason.

## Responsive and theming
- Shell switches at MUI `md` (sidebar + header vs bottom nav + FAB); phone rules below 600px. Check 1440, 768, 390 and 320 widths; no horizontal page scroll; 320px reflow must work.
- Desktop: centred Dialogs / right panel. Phone: bottom sheets below the fixed app bar, primary actions in the thumb zone, 44px touch targets (`SegmentedTabs`, close buttons).
- **Dark mode is first-class**: every new surface verified in light and dark; use theme tokens so both work.
- Respect `prefers-reduced-motion`; motion never blocks a task.
- Money is tabular figures; use the shared formatters; amounts never truncate silently.

## Copy
Plain, specific, second person; say what happened and what to do next; no jargon ("Fast/Deep" was rewritten because it named the mechanism, not the choice). Errors are actionable.

## UX review output
Per finding: screen/component, issue, severity, **UX defect vs improvement**, fix. Do not repeat accessibility findings — hand them to accessibility-review.
