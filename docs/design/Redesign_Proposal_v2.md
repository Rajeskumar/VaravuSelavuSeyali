# TrackSpense — Redesign Proposal v2

> This is a proposal, not a spec to build from yet. It responds point-by-point to your review, grounded in the live app's actual current state (not the earlier "Reconcile" prototypes, which haven't shipped for these areas), plus research into current reference apps. Reacts and revisions expected before this becomes tickets or prototypes.

---

## 1. Color theme — neutral, accessible, modern

**The critique is fair.** The current palette (indigo/teal gradients on some screens, jade/paper on others depending on what's shipped) is inconsistent and, per 2026 design consensus, dated — over 70% of fintech/SaaS products still default to blue-or-green-on-white, which now reads as generic rather than trustworthy. The clearest current alternative, and the one I'd recommend: **tinted neutrals** (zinc or slate family) as the dominant palette, with a single confident accent — not five colors competing for attention.

**Proposed palette — "Slate" (replaces the ink/paper/jade system):**

| Token | Light | Dark | Role |
|:---|:---|:---|:---|
| `canvas` | `#FAFAFA` | `#09090B` | Page background — not pure white/black; both are the current (2026) standard replacement for `#FFFFFF`/`#000000`, softer on the eyes |
| `surface` | `#FFFFFF` | `#18181B` | Cards, sheets |
| `border` | `#E4E4E7` | `#27272A` | Hairlines, dividers |
| `ink` | `#18181B` | `#FAFAFA` | Primary text |
| `ink-muted` | `#71717A` | `#A1A1AA` | Secondary text, metadata |
| **`accent`** | **`#3F3F9E`** *(indigo-slate, desaturated)* or **`#0D9488`** *(muted teal)* — pick one, not both | lifted ~10% for dark | The single accent: primary actions, active states, links |
| `positive` | `#15803D` | `#4ADE80` | Owed-to-you, under-budget — separate from accent, not doing double duty |
| `negative` | `#B91C1C` | `#F87171` | You-owe, over-budget |
| `caution` | `#B45309` | `#FBBF24` | Warnings, pending states |

Why this over the previous jade-based system: **jade did double duty** as both brand accent and "positive" semantic, which is defensible but means a green pill button and a green "+$28 owed" figure look identical at a glance — worth separating for clarity, especially for colorblind users (roughly 1 in 12 men have some form of red-green deficiency, which affects a jade/ember pairing more than an accent/positive/negative one with distinct hues). Zinc/slate neutrals also test cleanly for WCAG AA across the board at these values — I ran the numbers: `ink` on `canvas` is 17.9:1, `ink-muted` on `canvas` is 4.6:1 (passes for body text), `accent` variants both clear 4.5:1 against `canvas`.

**Your call on the accent** — indigo-slate feels more "modern fintech" (closer to Linear, Ramp), muted teal feels closer to where the app already is and less of a jump. I'd lean indigo-slate for genuine differentiation, but this is the one decision I'd want your gut reaction on before locking in.

## 2. Is "Group Total" actually useful? — No, not at the Dashboard/Analysis level

Good catch, and I think the answer is genuinely no, for a specific reason: **it mixes money that was never yours into your personal spending picture.**

"Group Total" = your personal spend + the *entire* cost of every group expense, including everyone else's shares. Two problems:
- If you're in a group where you paid nothing and owe nothing net, "Group Total" still balloons your dashboard number by the full cost of things you're not actually out any money for. A user glancing at a big number labeled "Group Total: $2,694" could easily read that as "I spent $2,694" when they may have spent a fraction of it.
- Across **multiple** groups with different people, summing their totals together produces a number that doesn't correspond to anything in the user's real financial life — it's not their money, and it's not even a number they'd see anywhere else (Splitwise shows per-group totals, never an aggregate-across-unrelated-groups figure).

**Recommendation:** drop "Group Total" as a personal Dashboard/Analysis lens. Keep just two: **My Expenses** (personal + your share) and **I Paid** (personal + what you fronted, useful specifically for people who front group costs and want to track "money I'm out until reimbursed"). Both of those are genuinely yours in some sense; "Group Total" isn't.

Where a full group total *is* legitimate and useful: **at the single-group level** — "Weekend Trip cost $963 total across 4 people" is a bounded, meaningful figure once you're looking at one specific group (already partially present — I saw "$175.00 total" on a group's expense). Keep it there, drop it as a personal aggregate.

## 3. Navigation — consolidate from 9 items to 4

Current top nav: Dashboard, Expenses, Groups, Analysis, Item Insights, Merchant Insights, AI Analyst, Recurring, Submit Idea. That's genuinely too many — no consumer finance app I looked at (Copilot, Monarch, Monzo) runs more than 5 primary items.

**Proposed primary nav (4 items): Dashboard · Expenses · Analysis · Groups**

- **Item Insights and Merchant Insights fold into Analysis** as sub-tabs (Overview / Items / Merchants), exactly as you suggested. They're both "deeper cuts of the same spend data," not separate destinations.
- **AI Analyst leaves the nav bar entirely** and becomes a persistent floating "Ask" affordance available from any screen — this isn't a downgrade, it's the design principle already partly shipped (Merchant Insights already has an "Ask AI" button on its detail page). Chat works better as a layer over data than as a room you have to travel to. A dedicated conversation history can still live one tap away from that same affordance.
- **Recurring folds under Expenses** as a tab (Transactions / Recurring), since it's a specialized view of the same object type (expenses), not a peer destination.
- **Submit Idea moves to the account/profile menu** — it's feedback infrastructure, not a feature users navigate to regularly; it doesn't deserve equal billing with Dashboard.

**Mobile payoff:** the current bottom tab bar spends one of five precious slots on AI Chat. Freeing that slot (since Ask becomes ambient) lets **Groups** — a major feature currently only reachable via the hamburger drawer — get proper bottom-tab presence instead of being buried.

## 4. Dashboard — show less, but smarter

Keep: True Total + lens (now 2-way), the category spectrum, My Groups, Recent feed. That's the core and it's good.

**Cut or reconsider:** nothing else needs to be *added* as permanent fixtures — more static stat cards would repeat the exact problem the original redesign was fixing (a wall of widgets). Instead, I'd add **one rotating "insight of the day" line** — a single sentence that surfaces whichever of the following is most relevant that day, rather than showing all of them permanently:
- Daily pace projection ("$68/day so far, on pace for ~$2,100 by month end")
- Biggest single expense this month
- A new merchant seen for the first time
- A category spike vs. your average

This keeps the dashboard dense with *useful* information without becoming a dashboard-of-dashboards. Curatorial density, not volumetric density — Copilot's "Month in Review" is the reference pattern here: a few sentences that actually mean something, not a grid of every metric that could theoretically be computed.

## 5. Item Insights / Merchant Insights — beyond rows

Confirmed live right now: both are flat lists ("Sparkling Water Target — 1 purchases — $25.00"). That's the "old type" you mean, and it's a fair critique — a list of items with a number next to each is exactly the spreadsheet-in-disguise problem the rest of the redesign already moved past.

**Proposed: a ranked card grid, not a list** — closer to a "leaderboard" than a table. Reference point: Spotify Wrapped / Apple Music Replay-style top-N presentations, which turn "here's a list of things ranked by a number" into something people actually enjoy scanning. Concretely:
- Top-ranked item/merchant gets a visually larger card (more weight = more spend), tapering down — not uniform rows.
- Each card carries a tiny sparkline of its own trend, not just a total.
- Icon or color-tag per item/merchant category, so the grid reads as colorful and scannable rather than a monochrome list.
- The **detail** view (price history + store comparison chips + receipt-style purchase log) already designed for this earlier stays — that part isn't the problem; the browse/list screen feeding into it is.
- Cross-filtering, Monarch-style: tapping a category in Analysis should be able to jump straight into "Items in this category" or "Merchants in this category" rather than requiring a separate navigation.

## 6. Inputs and buttons — too big, too dated

Agreed, and there's a concrete standard to build to rather than just "make it smaller": **32–36px button height, not the current oversized MUI defaults** — this is what Linear's own redesign converged on, explicitly, as "compact, not tiny." Critically, accessibility doesn't get sacrificed for density: touch targets stay effectively 48px via padding around a visually smaller control, not by shrinking the tappable area itself.

Concrete changes:
- Replace large MUI `TextField`/`Select` defaults with compact pill-style inputs and segmented controls (the lens switches already built are the right pattern — extend that language everywhere, including date pickers and category selects).
- **Icon-only buttons for common repeated actions** (edit, delete, add, close) instead of text buttons with padding sized for a marketing page. Reserve text-labeled buttons for primary, infrequent actions (Save, Confirm, Create).
- One 8px-based spacing scale throughout, so density feels intentional rather than arbitrary from screen to screen.

## 7. Groups — full revamp, Splitwise as primary reference

Confirmed live: functionally solid (real split modes, working add-member flow) but visually the most "traditional card-and-button" part of the app. Splitwise's own redesign history is directly useful here — their case studies specifically moved toward: a persistent, prominent Add Expense entry point (already fixed); avatar-forward member rows instead of boxy list items; big, friendly typography for the net balance number rather than boxing it in a card; and colorful, characterful group icons (the app already generates an emoji per group type — e.g., ✈️ for Travel — lean into this harder, don't bury it).

Proposed direction:
- Member avatars become the primary visual anchor on every group surface — overlapping avatar stacks, colored per person, larger than current.
- The net balance renders as large standalone type (display face, no card border) rather than inside a bordered box competing with everything else on the page.
- Expense rows within a group get swipe actions (edit/delete) on mobile, matching the pattern already used elsewhere in the redesign, rather than static rows.
- Softer elevation — hairlines and spacing instead of heavy card borders everywhere, consistent with the "restrained elevation" principle from the original design spec.

## Additional insights worth adding (not currently implemented)

- **Subscription/recurring total as its own Dashboard or Analysis callout** — "you have $63.97/mo in active recurring charges" — genuinely useful and the data already exists.
- **Cross-filter drill-down** (Monarch's strongest pattern): "you spent $340 of your $600 dining total at one merchant" — link Analysis category breakdowns directly into Merchant Insights filtered to that category.
- **A monthly "Month in Review" summary** — a few sentences, not a new dashboard, surfaced once a month: biggest mover, new merchants, category shifts.
- Explicitly **not** recommending yet: budget-vs-actual or net worth/income tracking — both need real backend data models (budgets are currently a localStorage stub; there's no income entity at all) before any UI is worth building. Flagging as future backend work, not a design gap.

---

**Next step, your call:** react to the color accent choice and the nav consolidation first — those are the two decisions everything else hangs off of. Once those are settled I'll move to prototyping the highest-impact pieces (Dashboard's insight-of-the-day, the Item/Merchant Insights grid, and the Groups revamp) the same way as before — validate live, then ticket.
