# Orientation Report v2 — TS-DES-101…113 vs. the Redesign Proposal v2

> **Read-only pass. No code or tickets were modified.** Sources read, in order: `UX_Design_Spec.md` +
> `UX_Audit_and_Redesign.md` (the original "Reconcile" direction), `Redesign_Proposal_v2.md` (the
> superseding direction — Slate palette, indigo-slate accent, 4-item nav), the seven `prototypes/v2/`
> reference files (`Dashboard.jsx`, `Analysis.jsx`, `Expenses.jsx`, `Groups.jsx`, `Account.jsx`,
> `Home.jsx`, `Ask.jsx`) plus `prototypes/v2/CreateGroup.jsx`, `Live_QA_Findings_and_Plan.md`, all
> twelve `docs/design/tickets/TS-DES-10x.md` files, `docs/FEATURE_STATUS.md` §7, the live web routes
> (`varavu_selavu_ui/src/App.tsx`, `navItems.ts`), and the mobile tab/stack config (`varavu_selavu_mobile/App.tsx`).

**Housekeeping note before anything else:** only **TS-DES-101 through TS-DES-112** exist as ticket
files in `docs/design/tickets/`. There is no `TS-DES-113` anywhere in the repo (`docs/`, `FEATURE_STATUS.md`,
tickets folder — confirmed by grep). The instruction to review "101 through 113" appears to assume a
ticket that was never created. Treat the numbering range below as 101–112; if TS-DES-113 was meant to
exist, it needs to be tracked down or the assumption corrected before the fresh 2xx series is cut.

**A second correction, found by inspection, not assumption:** the orienting instructions asserted
`docs/design/prototypes/v2/CreateGroup.jsx` "is STALE — still on the old palette." I read the file
before taking that at face value. It isn't true: `v2/CreateGroup.jsx`'s own `colors` object
(`canvas #FAFAFA`, `surface #FFFFFF`, `border #E4E4E7`, `ink #18181B`, `accent #3F3F9E`, `positive #15803D`)
is hex-for-hex identical to `v2/Groups.jsx`/`Analysis.jsx`/`Expenses.jsx`, and the file even carries its
own comment saying so ("Same desaturated categorical palette used in Groups.jsx / Analysis.jsx /
Expenses.jsx"). The **stale** file is `docs/design/prototypes/v1/CreateGroup.jsx`, which does use the
old Reconcile tokens (`ink #191A1E`, `jade #0FA37F`, `ember #DE5B4B`, `gold #C9973F`, `paper #F7F7F4`
— confirmed by grep). It's plausible the two got conflated when the orienting note was written. **Net:
`v2/CreateGroup.jsx` does not need a palette redo** — flag this correction rather than propagate the
false premise into new tickets.

---

## 1. Ticket-by-ticket: TS-DES-101 → TS-DES-112

Legend: 🟢 still valid as scoped · 🔴 superseded, close/replace · 🟡 partially valid, needs amendment

| Ticket | Verdict | Why |
|:--|:--:|:--|
| **TS-DES-101** — Reconcile tokens module | 🔴 | Its entire content is the Reconcile palette (`ink/paper/jade/ember/gold`, Clash Display, 10px/8px radius). Proposal v2 §1 replaces this wholesale with the **Slate** palette (`canvas/surface/border/ink/ink-muted/accent/positive/negative/caution`) and drops the jade-does-double-duty design (brand ≠ semantic-positive now, on purpose — see §1 rationale re: colorblind users). The radius/elevation/tabular-nums *policy* (10px surfaces, pill reserved for lens/chip, hairline > shadow) still holds — only the token *values* and the "jade is both brand and positive" rule are gone. This needs a straight replacement ticket, not an amendment; too much of 101's body (hex table, dark-mode lift rules, `directionalColor()` semantics) is palette-specific. |
| **TS-DES-102** — ExpensesPage day-grouped feed | 🟡 | The feed pattern itself (sticky day headers, tint-dot rows, swipe-to-reveal edit/delete, tap→detail sheet) is unchanged and confirmed live in `v2/Expenses.jsx`'s `ExpenseRow`/`ExpenseDetailSheet`. Two things changed underneath it: (a) palette → Slate (same as every ticket below), (b) **structural scope**: `v2/Expenses.jsx` now hosts a `SubTabBar` with **Transactions / Recurring** — Recurring is no longer a peer nav destination, it's a tab inside this page (see §2). TS-DES-102's original scope never touched Recurring. Amend to add the sub-tab host, or split into "feed rebuild" (still valid) + "absorb Recurring tab" (net-new). |
| **TS-DES-103** — Dashboard True Total + lens | 🟡 | Structure (hero, status line, category spectrum, My Groups strip, Recent feed) is intact in `v2/Dashboard.jsx`. Two concrete deltas: (1) the lens is **two-way now** (`My Expenses` / `I Paid`) — `Group Total` is explicitly cut per Proposal v2 §2 ("mixes money that was never yours into your personal spending picture"); `computeLensTotal` in `v2/Dashboard.jsx` only has two branches. (2) Proposal v2 §4 adds a single **rotating "insight of the day"** line (`InsightOfTheDay` component in the prototype) in place of static permanent widgets. Needs amendment on both the lens arity and the insight-surfacing mechanism (see TS-DES-111 below — this second point directly conflicts with what 111 already built). |
| **TS-DES-104** — Groups restyle + settle-up hero | 🟡 | Its "just restyle already-built UI onto tokens + add settle-up hero/count-to-zero" scope is real and still needed (retarget to Slate tokens). But Proposal v2 §7 asks for materially more: avatar-forward member rows as the *primary visual anchor* (overlapping stacks, larger, colored per person), the net balance as **large standalone type with no card border** (not inside a bordered box), swipe actions on group expense rows, and softer elevation throughout. `v2/Groups.jsx`'s `AvatarStack`/`Avatar` components confirm this is a bigger visual language shift than "restyle onto new hex values" — it's closer to a second structural pass on the Groups surface. Amend scope upward, don't just retoken. |
| **TS-DES-105** — Chart restyle (Plotly/chart-kit) | 🟡 | The *policy* (hairline gridlines, tabular numerals, no modebar, restyle donut→spectrum) is untouched by Proposal v2. Only the specific series colors (jade/ember/gold → accent/positive/negative/caution) need updating. Lower-effort amendment than 101/103/106 — this is close to a value swap once 101's replacement lands. |
| **TS-DES-106** — Expense Analysis rebuild | 🔴 | FEATURE_STATUS.md marks 106 "✅ Built," but the ticket file's own header still says "🔴 Not started" — that's a stale header worth fixing regardless of this pass (see §4). Substantively, though, this ticket is superseded on IA grounds: `v2/Analysis.jsx` merges **Item Insights and Merchant Insights into Analysis as sub-tabs** (`SubTabBar`: Overview / Items / Merchants) — TS-DES-106 never scoped that; it only covered what's now the "Overview" tab (`WhatChangedRail`, `CategorySpectrum`, `AskSheet`, `TrendNavigator` all map cleanly to Overview-tab pieces in the v2 prototype). The lens also narrows to two-way, same as 103. This is less "amend" and more "the ticket describes one-third of the new page" — recommend closing and re-cutting as a wider Analysis-page ticket that explicitly owns the tab host and the Items/Merchants tab migration from 107/108. |
| **TS-DES-107** — Item Insights rebuild | 🔴 | Fully superseded as a **standalone page/route** ticket. `/item-insights` disappears as a nav destination and a route (see §2); its content (`StatBlock`, `PriceHistoryChart`→`PriceLine`, `StoreComparisonChips`→`StoreChips`, `PurchaseTape`) moves near-verbatim into `Analysis`'s `Items` tab — confirmed by direct comparison, `v2/Analysis.jsx`'s `ItemsTab`/`PriceLine`/`StoreChips`/`PurchaseTape`/`StatBlock` are functionally the same components 107 already specified. The **components are still valid and reusable**; the ticket's premise (a standalone page) is not. Close 107, fold its component list into the new Analysis ticket as the "Items tab" sub-scope. |
| **TS-DES-108** — Merchant Insights rebuild | 🔴 | Same pattern as 107: standalone-page premise superseded, components (`StatBlock`, `MonthlySpendSparkline`, `WhatChangedCallout`) survive and map onto `v2/Analysis.jsx`'s `MerchantsTab`. Close and fold into the Analysis ticket's "Merchants tab" sub-scope, same as 107. |
| **TS-DES-109** — AI Analyst rebuild | 🟡 | The **"Looked at: ..." chip and Fast/Deep picker survive intact** — confirmed in `v2/Ask.jsx` (`m.scope` rendered under each assistant message, `MODELS = [Fast, Deep]`). What changes structurally: AI Analyst is **no longer a nav tab or dedicated page** — Proposal v2 §3 explicitly moves it off the nav bar into an ambient, summonable "Ask" affordance reachable from anywhere, and `v2/Ask.jsx`'s own subtitle literally says *"Reached from 'Ask' anywhere in the app — not a tab of its own."* This is the same "chat is a layer, not a room" principle from the original Design Spec §1.4/§4, just followed through more completely (the original TS-DES-109 kept a dedicated tab as "the fallback, not the main event" — v2 removes the tab entirely). Needs amendment: rehost as a global overlay/sheet component + a route for deep-linking (existing `?q=...` cross-links from Item/Merchant Insights must still resolve to something), remove from `navItems.ts`. The backend gaps this ticket flagged (no true intent-resolution behind the chip, no group-aware chat tool) are **unchanged** — see §3. |
| **TS-DES-110** — Recurring rebuild | 🔴 | Card-per-template pattern (`RecurringCard`, pause/resume toggle, due/paused pill) is preserved almost exactly in `v2/Expenses.jsx`'s `RecurringTab` — even gains a "Run now" affordance not in the original ticket. But the **host page is gone**: `/recurring` folds into `Expenses` as a sub-tab (§2), so this is no longer a standalone-page ticket. Close 110, fold its component scope into TS-DES-102's amended (feed + sub-tab-host) scope. |
| **TS-DES-111** — Dashboard fixes + global Add Expense (web) | 🟡 | The **FAB / global Add Expense entry point is unaffected** by the v2 pivot — keep as-is. The **three dashboard additions directly conflict with Proposal v2 §4**: 111 built a permanent MoM-delta line + a permanent `WhatChangedTeaser` + a permanent `DueSoonStrip`, all always-rendered (or rendered/hidden by empty-state). Proposal v2 §4 explicitly argues *against* this: *"nothing else needs to be added as permanent fixtures — more static stat cards would repeat the exact problem the original redesign was fixing... Instead, I'd add one rotating 'insight of the day' line."* `v2/Dashboard.jsx`'s `InsightOfTheDay` is a single expandable line cycling one of {pace projection, biggest expense, new merchant, category spike} — not three separate always-on strips. This is a real, not cosmetic, conflict: 111's three components need to either collapse into the rotating-insight pattern or be explicitly re-justified against the new dashboard philosophy. Also inherits 103's two-lens change (its `momDelta` prop threads through `TrueTotalHero`, which itself needs the lens-arity amendment). |
| **TS-DES-112** — Mobile dashboard parity + fixes | 🟡 | Same insight-surfacing conflict as 111 (mirrors it deliberately, so the same fix propagates). However, **the five bug fixes bundled into this ticket are independent of the design-direction pivot and remain fully valid regardless of Slate vs. Reconcile**: the three dead "Add an Expense" CTAs (`navigation.navigate('Add Expense')` calling a route that doesn't exist), the cross-screen refresh gap (`useIsFocused()` never firing because `AddExpenseProvider` is a `Modal` sibling, not a navigator screen), the invalid hardcoded `'Inter'`/`'Space Grotesk'` fontFamily strings, the off-palette raw hex in `InsightRail`, and `Card.tsx`'s missing hairline border are all real, already-diagnosed bugs that should ship independent of any v2 retheming — don't let them get re-bundled into or blocked by the larger redesign work. |

**Summary tally:** 5 superseded outright (101, 106, 107, 108, 110), 6 need amendment (102, 103, 104,
109, 111, 112), 1 lightest-lift amendment that's close to a pure value-swap (105).

---

## 2. Routing / IA changes required

Current web route table (`varavu_selavu_ui/src/App.tsx:155-172`) and nav array
(`varavu_selavu_ui/src/components/layout/navItems.ts`) — confirmed live, 9 nav destinations:
`Dashboard, Expenses, Groups, Analysis, Item Insights, Merchant Insights, AI Analyst, Recurring, Submit Idea`.
Mobile's bottom tab bar (`varavu_selavu_mobile/App.tsx:153-174`) currently runs 5 tabs: `Dashboard,
Expenses, GroupsTab, Analysis, AI Analyst` (plus a center "+" — confirmed, matches Proposal v2 §3's "one
of five precious slots on AI Chat" framing exactly).

| Current route | Disposition under v2 | Notes |
|:--|:--|:--|
| `/item-insights` | **Remove as a nav destination; become a query-param sub-tab of `/analysis`** (e.g. `/analysis?tab=items&item=<id>`) | The page component's logic is largely reusable inside Analysis's `Items` tab (§1). Existing deep-links (`/item-insights?item=...` from "Ask AI about this item" and any bookmarks) should **301-equivalent client-side redirect** to the new query shape, not just disappear — confirmed this cross-link is explicitly called out as something that "must keep working" in TS-DES-107/109's own acceptance criteria. |
| `/merchant-insights` | Same treatment: fold into `/analysis?tab=merchants&merchant=<id>` | Same redirect requirement for the existing `?merchant=` deep link and the "Ask AI about this merchant" cross-link. |
| `/recurring` | **Fold into `/expenses` as a sub-tab** (`/expenses?tab=recurring`) | `v2/Expenses.jsx` hosts this via `SubTabBar` (`Transactions`/`Recurring`). Redirect the bare `/recurring` route to `/expenses?tab=recurring` for bookmarks and the login due-prompt's any internal links. |
| `/feature-request` | **Fold into `/account` as the "Feedback" tab** | `v2/Account.jsx` hosts `Profile`/`Feedback` via the same `SegmentedTabs` pattern. Redirect `/feature-request` → `/account?tab=feedback`. |
| `/profile` | **Fold into `/account` as the "Profile" tab (default)** | Redirect `/profile` → `/account` (Profile is the default/first tab in `v2/Account.jsx`). |
| `/ai-analyst` | **Remove from primary nav; keep a route for deep-linking, rehost the UI as an ambient overlay** | `v2/Ask.jsx` is explicit that this is "reached from 'Ask' anywhere in the app — not a tab of its own." A route (e.g. `/ask`) should still exist so `?q=...` auto-submit deep links from Item/Merchant Insights keep working, and so the back-chevron in the prototype has somewhere to return to — but it's launched from a persistent floating affordance, not `navItems.ts`. |
| *(new)* `/account` | New route hosting the merged Profile + Feedback tabs | Replaces `/profile` and `/feature-request` as nav-visible destinations; both old routes redirect here. |

**`navItems.ts` itself needs to shrink from 9 entries to 4**: `Dashboard, Expenses, Analysis, Groups` —
matching Proposal v2 §3 exactly. `Account` becomes a menu item off the user/avatar affordance (not a
main nav pill), matching how `v2/Account.jsx` is entered via a back-chevron rather than a tab bar
highlight. Mobile's bottom tab bar loses the `AI Analyst` tab (freeing a slot) and should gain `Groups`
as a real tab per Proposal v2 §3's explicit "mobile payoff" — Groups is currently only reachable via
the mobile drawer (confirmed: `GroupsScreen`/`GroupDetailScreen` are `Stack.Screen`s outside `MainTabs`,
not inside the 5-tab `Tab.Navigator`).

---

## 3. Backend dependency cross-check

### 3.1 TS-DES-106's lens ↔ Groups' per-category data model

**Still holds, narrowed but not resolved.** The original flag was: `AnalysisResponse.category_totals`/
`category_expense_details` are flat single numbers with no per-category `my_share`/`i_paid`/`group_total`
split — only the *headline* level (`group_summaries`, confirmed present with exactly those three fields
in `docs/features/groups/TrackSpense_Groups_Product_Spec.md:542`) has that granularity today. Dropping the
third lens (`Group Total`) does **not** remove this dependency — `My Expenses` and `I Paid` still each
need their own per-category number, which is the same missing data shape, just needing two fields
instead of three. No evidence this landed: grep across `FEATURE_STATUS.md` and the Groups Product Spec
turns up `my_share`/`i_paid`/`group_total` only at the group-summary level, never at category
granularity. **Status: unresolved, same as originally flagged** — build the two-way lens UI now
(aliased to the existing scope filter, same workaround TS-DES-106 already proposed), leave the TODO in
place.

### 3.2 TS-DES-109's "Looked at" chip ↔ TS-ANL-005

**Still holds, unresolved, confirmed via FEATURE_STATUS.md.** TS-ANL-005 is marked ✅ Built (line 38),
but what shipped is `build_rag_context()` — targeted RAG context injection when a query matches an
item/merchant pattern, feeding into the same 3-tool LangGraph ReAct agent (`get_expense_summary`,
`get_item_insights`, `get_merchant_insights`) noted in the original ticket. This is **still not**
structured free-text → `{period, scope}` resolution the chip needs to render honestly; the agent
answers questions, it doesn't emit a machine-readable "here's what scope I resolved" side-channel.
Additionally checked whether a group-aware chat tool has since appeared: it hasn't — the tool list is
unchanged at three, all personal-expense/item/merchant. The one adjacent, tangentially related ticket
(`TS-GRP-134` — "Change Insights: group-aware copy") is **not** in `FEATURE_STATUS.md`'s built list, so
it's still planned, not shipped, and it addresses insight *copy*, not chat-agent scope resolution
anyway. **Status: exactly as unresolved as when TS-DES-109 flagged it** — the chip must still ship with
a documented placeholder value, and group-scope chat questions (the `v2/Ask.jsx` prototype's own
starter prompt, "How much do I still owe in Weekend Trip?") will not resolve correctly against the real
backend today.

---

## 4. What's already partially live — checked against v2, not v1

`Live_QA_Findings_and_Plan.md` (§3) found three things already implemented and confirmed them working
live: Analysis's tap-a-month trend bars + "What Changed" section, and AI Analyst's Fast/Deep picker +
suggested prompts. Re-checking each against the **v2** prototypes specifically (the target moved):

- **Analysis's trend bars / What Changed section** — structurally matches `v2/Analysis.jsx`'s
  `TrendBars`/`WhatChangedRail`-equivalent pieces *for the Overview sub-tab only*. What's missing
  relative to v2, specifically: the `Items`/`Merchants` sub-tabs don't exist yet as part of this page
  (they're still separate `/item-insights`/`/merchant-insights` pages per §2), and the lens is still
  whatever arity the live `AnalysisLensSwitch` currently implements — needs verification at
  implementation time whether it already shows three options (My Share/I Paid/Group Total, per the
  original TS-DES-106) or was never wired to a real lens at all (TS-DES-106's own ticket said this was
  "cosmetic-only" pending the backend gap in §3.1). Either way it needs to collapse to two.
- **AI Analyst's Fast/Deep picker + suggested prompts** — matches `v2/Ask.jsx`'s `MODELS`/
  `suggestedPrompts` pattern closely at the *component* level. What's different in v2: this UI needs to
  stop living behind a dedicated `/ai-analyst` nav tab and become the ambient overlay described in §2 —
  the component work is largely reusable, the **hosting/entry-point work is net-new**, not yet live in
  any form (there's no floating "Ask" affordance anywhere in the current app; confirmed no `Fab`
  wired to chat, only the Dashboard's expense-entry `Fab` from TS-DES-111).
- **Not checked live by this pass** (per this being a docs-only orientation, not a browser click-through):
  whether `ItemInsightsPage`/`MerchantInsightsPage`'s actual rendered UI already matches their respective
  `v2/Analysis.jsx` sub-tab reference (`StatBlock`/`PriceLine`/`StoreChips`/`PurchaseTape` for Items,
  `MonthlySpendSparkline`/`WhatChangedCallout` for Merchants) — TS-DES-107/108 are marked "✅ Built" in
  `FEATURE_STATUS.md` against the **v1** prototypes; a live check against the v2 component shapes
  specifically (not just "does a rebuilt page exist") is worth doing before assuming the fold-into-Analysis
  work is mostly a routing change vs. also a visual re-check.

**A ticket-hygiene finding, not part of the design pivot but worth fixing alongside it:** TS-DES-106's
own ticket file header reads "Status: 🔴 Not started," while `FEATURE_STATUS.md` marks it "✅ Built" with
specific shipped-component names (`AnalysisLensSwitch`, `TrendNavigator`, `WhatChangedRail`,
`CategorySpectrum`, `AskSheet`). One of these two documents is stale. Given `Live_QA_Findings_and_Plan.md`
independently confirms live trend-bar/What-Changed behavior, `FEATURE_STATUS.md` is very likely the
accurate one and the ticket file's header simply never got updated post-build — same likely true for
107/108/109/110, whose ticket-file headers all still say "🔴 Not started" despite `FEATURE_STATUS.md`
marking 107/108/109/110 as built too. Worth reconciling before cutting the 2xx series so the new tickets
don't inherit stale "not started" framing for work that's actually already live.

---

## 5. Recommended fresh ticket numbering

Recommend retiring `TS-DES-1xx` as the active series for new work and opening **`TS-DES-2xx`**,
scoped against `Redesign_Proposal_v2.md` + the `prototypes/v2/` set as the sole source of truth (mirroring
how the `TS-DES-1xx` README named `UX_Design_Spec.md`/`UX_Audit_and_Redesign.md` as its own sole source).
Suggested breakdown, sized to avoid the "one ticket secretly does three pages' worth of work" problem
found in §1 (TS-DES-106 covering what's now three tabs):

| # | Title | Rationale |
|:--|:--|:--|
| TS-DES-201 | Slate tokens module (web + mobile) | Replaces 101 outright — new palette, same "tokens only, zero structural change" scoping discipline that made 101 easy to verify. |
| TS-DES-202 | Nav/IA consolidation — 4-item nav, `/account` route, redirects | Owns §2 wholesale: `navItems.ts` shrink, new `/account` page (Profile+Feedback tabs), redirect shims for `/profile`, `/feature-request`, `/item-insights`, `/merchant-insights`, `/recurring`. Cutting this as its own ticket (rather than letting each page ticket improvise its own redirect) avoids five different tickets inventing five different redirect conventions. |
| TS-DES-203 | Dashboard v2 — two-lens + insight-of-the-day | Supersedes 103 + the insight-surfacing part of 111/112; explicitly retires the MoM-delta/WhatChangedTeaser/DueSoonStrip three-strip pattern in favor of the single rotating line. FAB/global-add-expense work from 111 does *not* need to be redone — carry it forward unchanged. |
| TS-DES-204 | Expenses v2 — feed + Recurring sub-tab | Supersedes 102 + 110's component scope; owns the `SubTabBar` (Transactions/Recurring) host. |
| TS-DES-205 | Analysis v2 — Overview/Items/Merchants tab host | Supersedes 106 + 107 + 108's component scope entirely; this is the ticket that should explicitly own "these three used to be three pages, now they're one page with tabs," including the redirect contract from TS-DES-202. |
| TS-DES-206 | Groups v2 — avatar-forward revamp | Supersedes 104; scoped as the fuller visual pass Proposal v2 §7 actually asks for, not a token restyle. |
| TS-DES-207 | Ambient Ask — rehost AI Analyst as overlay | Supersedes 109; owns moving off the nav tab, the floating entry affordance, and re-pointing existing `?q=...` deep links. Explicitly documents the still-open backend gaps from §3.2 (no real intent-resolution, no group-aware tool) exactly as 109 did — this redesign work doesn't wait on that backend work, but shouldn't quietly drop the caveat either. |
| TS-DES-208 | Chart restyle — Slate series colors | Supersedes 105; smallest ticket in the set, likely a fast follow once 201 lands. |
| TS-DES-209 | Mobile parity pass | Carries forward 112's five genuine bug fixes (dead CTAs, cross-screen refresh, typeface, off-palette hex, `Card.tsx` hairline) as-is, decoupled from the dashboard-insight rework so they aren't blocked by design-direction debate. |

Before opening any of these: reconcile the `FEATURE_STATUS.md` vs. ticket-header discrepancy noted in
§4, and settle whether `TS-DES-113` was a real, lost ticket or a numbering error in the request — worth
a two-line answer before the 2xx series starts, so the old series is closed out cleanly rather than left
with an unexplained gap.
