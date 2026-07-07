# TS-DES-110 — Recurring rebuild

**Initiative:** Reconcile UX Redesign · **Build order:** 4th (batch 2; no cross-team dependency, can go first, lowest risk in this batch) · **Spec:** `UX_Design_Spec.md` §6 ("Recurring — card grid is correct here"), `UX_Audit_and_Redesign.md` §3.6/§6, `docs/design/prototypes/Recurring.jsx` · **Status:** 🔴 Not started

## Scope

Replace `varavu_selavu_ui/src/pages/RecurringPage.tsx`'s current structure — an always-visible
add/edit form `Card` (7-field grid: Description/Category/Merchant/Day/Cost/Start date/Active-Paused
`Switch`) above a dense MUI `Table` (Description/Category/Merchant/Day/Cost/Start/Last
Processed/Status/Actions columns, edit via row `IconButton` that repopulates the form) — with
`Recurring.jsx`'s pattern: restyled **cards** (one per template, not a table row — Design Spec §6
explicitly calls Recurring "the one place a card grid is correct," so this ticket restyles the
existing card-appropriate mental model rather than replacing cards with a feed, unlike
Expenses/Dashboard), each showing name/cost/category/next-due-or-paused-badge and a **pause/resume
toggle switch directly on the card** wired to the existing `POST /recurring/upsert` endpoint (no
need to open the full edit form just to pause something). Also replaces
`components/expenses/RecurringPrompt.tsx`'s **blocking modal** login due-prompt with a
**dismissible bottom sheet**, per the Audit's own explicit call-out (§3.6: *"the login auto-prompt
is a good instinct... but as a blocking modal it interrupts; make it a dismissible bottom sheet /
inline banner"*) and Design Spec §5's "bottom sheets over modals" rule.

## Files it will touch

- `varavu_selavu_ui/src/pages/RecurringPage.tsx` — the `Table` is replaced by a card grid (or
  single-column card list on mobile widths — confirm at implementation time whether MUI `Grid`
  breakpoints or a simple flex-wrap list better matches the prototype's fixed-width card sizing).
  The add/edit form stays functionally the same (still needed for creating/editing full templates —
  the prototype doesn't show a create/edit flow at all, only the card list + toggle, so this
  ticket must design the create/edit form's Reconcile-restyled presentation itself, not copy it
  from the reference) but is likely better presented as a dialog/sheet triggered by an explicit
  "Add" action rather than an always-visible form card taking up permanent page real estate above
  the list — decide at implementation time, and if changed, confirm the existing category-suggest
  debounce (`suggestCategory`, the `scheduleFetch` 1500ms-debounced autocomplete) still works
  wherever the form ends up living.
- **New component** `varavu_selavu_ui/src/components/recurring/RecurringCard.tsx` — per
  `RecurringCard.tsx`'s reference: name + cost header row, category caption, a due-date pill
  (jade-tinted, "Due {date}") or a paused pill (hairline-tinted, "Paused"), and a footer row with
  "Charges on the {ordinal}" caption + a pause/resume `ToggleSwitch`. The toggle calls
  `upsertRecurringTemplate({ ...existing fields, status: newStatus })` directly — confirm the
  existing `UpsertRecurringTemplatePayload` type (it requires `description`/`category`/
  `day_of_month`/`default_cost` as non-optional) accepts a partial-looking call correctly, i.e. the
  card must have the full template's fields on hand to re-send them all with just `status` flipped,
  since `/recurring/upsert` is confirmed to be a full-object upsert, not a `PATCH`.
- `varavu_selavu_ui/src/components/expenses/RecurringPrompt.tsx` — rebuilt as a bottom sheet
  (`Drawer anchor="bottom"` on mobile widths / dialog-adjacent on desktop, matching the pattern
  established in TS-DES-102's `ExpenseDetailSheet`) instead of a blocking `Dialog`. The existing
  per-session "only prompt once" (`sessionStorage` key), per-item checkbox+amount-override, and
  "Confirm and Add"/"Skip" actions all stay — this is a container-and-visual change (modal → sheet,
  restyled to tokens), not a logic change. Per the prototype's `dueNow`/`confirmedIds` pattern, add
  a per-item "Confirm" action (checkmark once confirmed) alongside the existing bulk "Confirm and
  Add" — a nicer incremental-confirm affordance the current all-or-nothing dialog doesn't have,
  optional polish if time allows, not a hard requirement.
- Existing `listRecurringTemplates`/`upsertRecurringTemplate`/`deleteRecurringTemplate`/
  `executeRecurringNow`/`getRecurringDue`/`confirmRecurring` API calls — untouched, this is
  presentation-only.

## Acceptance criteria

- `RecurringPage.tsx`'s dense `Table` is gone, replaced by a card grid/list matching
  `RecurringCard`'s layout (name/cost header, category, due/paused pill, charges-on-the-Nth
  footer + toggle).
- The pause/resume toggle on each card works end-to-end against the real
  `POST /recurring/upsert` endpoint (full-object re-send with just `status` changed) — verified via
  a real toggle + page refresh showing the change persisted, not just optimistic local state.
- The add/edit template flow still exists and still works (category-suggest debounce included),
  wherever it ends up living in the new layout.
- `RecurringPrompt.tsx` no longer blocks interaction with the rest of the app — it's dismissible
  (tap outside / explicit close) without losing the "only once per session" behavior, and its
  visual treatment matches the bottom-sheet pattern used elsewhere in this redesign (`ExpenseFeed`'s
  detail sheet, `SettleUpDialog`/`SettleUpSheet`'s bottom-sheet-on-mobile-widths convention).
- Dark mode verified.
- No backend or API-client changes.

## Dependencies

None. Fully self-contained and the lowest-risk ticket in this batch — can start immediately.

## Test requirements

- No new Jest/pytest suites required as a gate, consistent with this initiative's approach.
- Manual verification: run the web app, confirm the card grid renders real templates, toggling
  pause/resume on a card persists correctly (verified via refresh or re-fetch, not just local
  state), the add/edit flow still works end-to-end (including category-suggest), the login
  due-prompt renders as a dismissible sheet rather than a blocking dialog and its confirm/skip
  flow still works, and dark mode holds up.
