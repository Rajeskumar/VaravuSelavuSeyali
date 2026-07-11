# TS-DES-203 — Dashboard v2: two-way lens + insight-of-the-day

**Initiative:** Redesign v2 · **Build order:** 3rd (depends on 201; independent of 202/210) · **Spec:** `Redesign_Proposal_v2.md` §2/§4, `ORIENTATION_REPORT_V2.md` §1 (TS-DES-103/111 verdicts), `docs/design/prototypes/v2/Dashboard.jsx` · **Status:** ✅ Implemented, web only (no PR yet — working tree only; see notes below)

## Scope

Supersedes TS-DES-103's lens arity and the insight-surfacing portion of TS-DES-111/112 (web and its
mobile mirror). Two changes to the existing `DashboardPage.tsx` structure (hero, status line,
category spectrum, My Groups strip, Recent feed — all otherwise intact and unchanged):

1. **Lens narrows from three-way to two-way.** `Group Total` is cut. Per `Redesign_Proposal_v2.md`
   §2, showing group money (which was never the user's own spending) alongside personal totals
   "mixes money that was never yours into your personal spending picture" — confirmed in
   `v2/Dashboard.jsx`'s `computeLensTotal`, which only has two branches (`My Expenses` / `I Paid`).
   This also applies to `ExpenseAnalysisPage`'s lens (owned by TS-DES-205, not this ticket, but the
   same two-branch collapse applies there too — flagging so both tickets land the same arity).
2. **Three permanent strips collapse into one rotating line.** TS-DES-111 built a permanent
   MoM-delta line + `WhatChangedTeaser` + `DueSoonStrip`, all always-rendered. Proposal v2 §4
   explicitly argues against this pattern ("more static stat cards would repeat the exact problem
   the original redesign was fixing"). Replace with a single `InsightOfTheDay` component — one
   expandable line, cycling through one of {pace projection, biggest expense, new merchant, category
   spike} per `v2/Dashboard.jsx`'s reference implementation.

**Carried forward unchanged, not rebuilt:** TS-DES-111's FAB / global Add-Expense entry point
(`MainLayout.tsx`) is unaffected by this pivot — do not touch it as part of this ticket.

## Files it will touch

- `varavu_selavu_ui/src/pages/DashboardPage.tsx` — remove the `Group Total` lens option and its
  associated data branch; remove the three permanent strip components in favor of mounting a single
  `InsightOfTheDay`.
- `varavu_selavu_ui/src/components/dashboard/TrueTotalHero.tsx` — lens switch narrows to two options;
  `momDelta` prop and rendering stay (TS-DES-111's MoM line survives as *part of* the hero, per
  `ORIENTATION_REPORT_V2.md` §1's note that 111's delta line itself isn't the conflict — the three
  *separate* strips are).
- **Removed:** `WhatChangedTeaser.tsx`, `DueSoonStrip.tsx` (TS-DES-111's components) — replaced, not
  amended in place, since the rotating-line pattern is a different data-presentation shape, not a
  restyle of the strip components.
- **New:** `varavu_selavu_ui/src/components/dashboard/InsightOfTheDay.tsx` — single expandable line,
  cycles through the four insight types listed above, sourced from data already fetched or one call
  away (`getChangeInsights`, `listRecurringTemplates`, `monthly_trend` — same sources 111's three
  strips already used, just recombined into one rotating presentation instead of three permanent
  ones).
- Mobile mirror: `varavu_selavu_mobile`'s `HomeScreen.tsx`/dashboard insight rail — same two changes
  (lens arity, strip-to-rotation collapse), matching TS-DES-112's mirrored conflict per
  `ORIENTATION_REPORT_V2.md` §1.

## Acceptance criteria

- Lens switch shows exactly two options (`My Expenses`, `I Paid`); `Group Total` is not reachable
  anywhere on the Dashboard.
- Exactly one insight element renders (the rotating line), not three permanent strips; it cycles
  through available insight types and gracefully shows nothing (not an empty/awkward line) when no
  insight data is available for any category.
- MoM delta line under the hero total still renders (carried from 111), including its existing
  "N/A"/first-month-of-data handling — don't regress that edge case while removing the other two
  strips.
- FAB / global Add Expense entry point unchanged — confirm no edit was made to `MainLayout.tsx`'s FAB
  wiring as part of this ticket.
- Dark mode verified for the new `InsightOfTheDay` component.
- Mobile dashboard mirrors both changes (lens arity, single rotating insight).

## Dependencies

TS-DES-201 (Slate tokens). Independent of TS-DES-202 and TS-DES-210 — this ticket's structural
change to `DashboardPage.tsx` doesn't touch nav or app-shell chrome, so it can proceed in parallel
with those once 201 lands. Supersedes the lens/lens-related portions of TS-DES-103, and the
insight-surfacing (not FAB) portion of TS-DES-111/112.

## Test requirements

- Update `DashboardPage.test.tsx`'s existing assertions that reference the three-way lens or the
  now-removed strip components, rather than leaving them red.
- Manual verification: confirm the two-lens switch produces correct totals for both options, the
  rotating insight cycles through real data without crashing on any of the four insight types
  (including each one's empty-state), and the FAB still works unmodified.

## Implementation notes (post-build)

- **Web only — mobile mirror deferred, not silently dropped.** Checked `varavu_selavu_mobile`'s
  dashboard/insight-rail files exist and would need the equivalent two changes, but given this
  ticket's own time budget and that `FEATURE_STATUS.md` already has an established, accepted
  pattern of "web only — mobile not updated this pass" for several other tickets in this
  initiative (TS-ANL-002 through 010), deferring the mobile side rather than doing it partially.
  Flagging explicitly here so it isn't mistaken for done — a follow-up ticket should port both
  changes to `HomeScreen.tsx`'s dashboard insight rail.
- **"Rotating" insight, clarified**: re-reading `v2/Dashboard.jsx`'s own `InsightOfTheDay`
  reference implementation, it renders exactly **one** hardcoded insight line with expand/collapse
  — there's no in-page auto-cycling carousel. "Rotating" describes which insight *type* shows
  (changes day to day / session to session as underlying data changes), not a timer-driven
  rotation within a single page view. Implemented accordingly: `pickInsight()` selects one insight
  per render from priority-ordered candidates; `InsightOfTheDay.tsx` renders that one line with a
  tap-to-expand detail, matching the prototype's actual interaction exactly.
- **Three candidate insight types, priority-ordered** (not the ticket's literal
  {pace projection, biggest expense, new merchant, category spike} — "new merchant" and "category
  spike" collapse into one, since both are already-ranked backend output the same way):
  1. `changeInsights[0]` — TS-ANL-004's top-ranked backend insight (covers category spikes, new
     merchants, unusual transactions, recurring-bill increases, etc. — 7 types, already
     relevance-ranked server-side, so no need to re-derive "which is most notable" client-side).
  2. Pace projection — computed locally (`personalTotal / (dayOfMonth / daysInMonth)`), only shown
     once at least 3 days into the month (a 1-day pace projection is close to meaningless) and only
     when a MoM delta exists at all (reuses the same signal TrueTotalHero's delta line already
     requires, rather than introducing a second "is there enough data" check).
  3. Biggest single expense this month, from the already-fetched `recent` feed — no new API call.
  Returns `null` (renders nothing) if none apply, matching the deleted components' empty-state
  discipline.
- **`recurringTemplates` fetch removed entirely**, not just its render — it existed solely to feed
  `DueSoonStrip`, which this ticket deletes outright (not one of the four candidate insight types).
  Left as dead state/effect would have been exactly the kind of half-finished leftover worth
  avoiding; removed the `listRecurringTemplates` import, state, and effect together.
- **`TrueTotalLens` type narrowed** from `'my_share' | 'i_paid' | 'group_total'` to the two-way
  type at its source (`TrueTotalHero.tsx`) — confirmed via grep this type isn't shared with
  `AnalysisLensSwitch.tsx` (Analysis page's own, separate lens component, TS-DES-205's scope) or
  `api/analysis.ts`'s `AnalysisGroupSummary` (which still has a `group_total` *field* — only the
  Dashboard's UI no longer offers it as a selectable lens; the data shape is unchanged).
- **Verified:** `npx tsc --noEmit` clean. Full web Jest suite: 14 suites / 46 tests, all passing —
  `DashboardPage.test.tsx` needed no changes (grepped it first; it never asserted on the three-way
  lens or either deleted component). Verified live via the running `web-ui` dev server: lens switch
  shows exactly `My Expenses`/`I Paid` (`Group Total` gone); with this session's seed data (no
  significant `changeInsights` this period), `pickInsight()` correctly fell through to the pace
  projection, rendering "On pace for $181.32 this month"; tapped to expand and confirmed the detail
  line ("10 of 31 days elapsed, +578% vs last month so far") renders correctly; confirmed the
  Add-Expense FAB is untouched (same component, same props, not part of this ticket's diff).
  Biggest-expense and backend-`changeInsight` candidate paths were not independently exercised live
  this pass (would need seed data with either no MoM history or a real detected change-insight) —
  verified by code review only; worth a follow-up check against different seed data.
