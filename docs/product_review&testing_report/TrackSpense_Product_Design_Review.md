# TrackSpense — Product & Design Review

**Reviewer:** Claude (agent-driven walkthrough) · **Date:** July 11, 2026
**Environment:** `http://localhost:3000` (frontend) + `http://localhost:8080` (API)
**Method:** Registered a fresh account (`reviewer0711@test.app`) through the app's own sign-up flow, seeded 11 personal expenses across categories/dates, one recurring template (Spotify), and one group ("Weekend Trip") with 3 members and shared expenses, then walked every page and flow while capturing screenshots and measuring the DOM directly.

---

## Executive Summary

**Product maturity: a promising, well-designed v1 skeleton with a genuinely differentiated concept, undermined by a few load-bearing correctness bugs.** The core idea — one ledger that fuses personal spending with your share of every group split into a single number — is a real gap in the market that neither Splitwise (groups only) nor Copilot/Monarch (personal only) fill. The visual language is clean and modern, the AI "Ask" feature works and is honest about its scope, and the analysis screens reach beyond raw numbers into light interpretation. But the app currently ships with a **date bug that stores every expense one day early and shifts it another day earlier on each edit**, and a **group balance panel that tells you the opposite of who owes whom**. For an expense/settle-up app, dates and balances are the product — these are not polish issues. Underneath, the feature surface is impressively broad for a v1; it needs a hardening pass far more than it needs new features.

### Top 5 findings (by severity)

1. **[Blocking] Dates are stored one day early, server-side.** Sending `07/15/2026` to the API stores `07/14/2026`. Every seeded expense displayed a day behind what was entered; items logged "today" appear under "Yesterday."
2. **[Blocking] Editing an expense shifts its date back another day, every save.** A Chipotle expense moved from JUL 4 → JUL 3 after I edited only its *cost*. The error compounds on repeated edits — silent data corruption.
3. **[Blocking] The group Balances side-panel inverts who owes whom.** After I paid a $300 group expense split equally, the panel labeled Alice and Bob as "you owe −$100" when they in fact owe *me*. The Balances *tab* and Settle-Up modal on the same screen show it correctly — two components disagree.
4. **[Major] Non-equal split entry (Exact / Percentage) is effectively unusable in the UI.** The amount inputs don't accept selection, concatenate typed digits, and the current-user row appears stuck at its default. Validation is correct, but a user can't reliably enter a 50/25/25 split.
5. **[Major] No bank/card sync and no true receipt OCR** put TrackSpense meaningfully behind Copilot, Monarch (aggregation) and Splitwise (receipt item-detection). Everything is manual entry.

---

## 1. Visual / UX Consistency Across Pages

The design system is coherent at the atomic level — one indigo primary (`#3F3F9E`-ish), zinc grays, consistent rounded corners, the Inter typeface throughout, a consistent left-nav shell. Where it breaks down is at the **component and layout level**, where the same job is done three different ways.

**Three different "add expense" forms for one conceptual action.** This is the most visible inconsistency:

- *Dashboard / Expenses "Add Expense"* — a centered modal with a **structured category picker** (icon chips: Home, Transportation, Food & Drink… then sub-categories), a merchant field, and a "Repeat monthly" toggle.
- *Recurring "Add Template"* — a **bottom-sheet-style** dialog with a completely different field layout and a **free-text Category box** (no picker), plus an "Active/Paused" toggle.
- *Group "Add Group Expense"* — a third modal, again with a **free-text Category box**, plus an inline "Paid by *you* and split *equally*" sentence with clickable links.

So the category input alone has two paradigms (rich picker vs. plain text), and the same "log a cost" task presents three distinct visual treatments depending on where you start.

**Container width varies between pages in ways that read as unintentional.** The Expenses and Dashboard content sits in a wide column; the Account/Profile page is a narrow centered column; Groups is a two-pane master/detail. There's no obvious reason the Profile form should be so much narrower than everything else.

**Date formats differ by surface.** The Dashboard "Recent" list uses `7/10/2026`; the Expenses list uses sticky headers like `JUL 8` / `YESTERDAY`; edit modals show `Jul 4`. Three formats for the same data.

**Balances are rendered twice with different results** (see §2 and §3) — the same numbers appear in a right-hand panel and a center tab, and only the tab is correct.

**Consistent and good:** button styling, the toast pattern ("Expense added," "Template saved," "Settlement recorded"), iconography, the FAB `+`, and the modal chrome are uniform and polished across the app.

## 2. UI Flow Consistency

**Add-expense entry points don't behave identically.** The FAB opens the structured-picker modal; the group's own "Add Expense" opens the group-specific modal; the recurring tab opens the template sheet. A user's mental model of "how do I log a cost" has to fork based on context.

**Edit and delete are consistent where they exist.** On the Expenses list, hovering a row reveals a pencil (edit) and trash (delete); edit reuses the same structured modal as Add (good — consistent), and delete always routes through a confirmation dialog ("This action cannot be undone"). Group expenses also expose edit/delete on hover. This part is predictable.

**Navigation is predictable.** The persistent left nav (Dashboard / Expenses / Analysis / Groups) always shows where you are via an active-state highlight, and sub-tabs (Transactions/Recurring, Overview/Items/Merchants, Expenses/Balances/Activity) are consistent. Back-navigation from drill-downs (e.g., merchant detail) uses a clear back arrow.

**One inconsistency in toggles:** the recurring template's "Active/Paused" switch is inverted (see §7).

## 3. Functionality — Where the Product Actually Stands

| Flow | Status | Notes |
|---|---|---|
| Registration | ⚠️ Partial | Account created, but the app **redirected to the logged-out landing page** with no auto-login and no confirmation message; I had to log in manually. |
| Login / Logout | ✅ Working | Email+password and a Google button (not tested); logout via avatar menu. |
| Add personal expense | ✅ Working | Merchant auto-suggests a category; structured category picker; saves with a toast. |
| Edit expense | ⚠️ Partial | Edit works, **but each save shifts the date back a day** (see below). |
| Delete expense | ✅ Working | Confirmation dialog; removes the row. |
| Recurring template — create | ✅ Working | Frequency, day-of-month, cost, start date. |
| Recurring template — execute | ✅ Working | "Run now" logs a real expense ("Recurring expense logged," status flips to "Logged"). |
| Create group | ✅ Working | Name + type (Trip/Home/Couple/Other). |
| Add member | ✅ Working | By registered email or by placeholder name. |
| Group expense — equal split | ✅ Working | Balances update correctly in the Balances tab. |
| Group expense — exact/% split | ❌ Broken (UI) | Amount inputs resist editing/concatenate; can't reliably enter custom splits. Validation logic itself is correct. |
| Choose payer / multiple payers | ✅ Working | Payer picker includes "Multiple people." |
| Settle up | ✅ Working | Per-member settle with amount, method (Cash/…), notes; "who owes whom" simplification; records and updates balances ("All squared up"). |
| AI "Ask" chat | ✅ Working | Accurate, scoped, transparent (see §5). |
| Analysis / Insights | ✅ Working | Overview, Items, Merchants + merchant drill-down. |
| Combined ledger | ✅ Working | Personal + group shares in one timeline. |
| Receipt upload | ❓ Untested | "Choose File" + "Parse Receipt" controls exist in the Add modal, implying OCR/AI parsing, but I couldn't supply a file into the OS picker to verify. |

**The date bug, proven at the API layer.** I POSTed an expense with `date: "07/15/2026"` and read it back: the stored value was `07/14/2026`. This is a classic UTC-parsing / timezone off-by-one applied on *write*, so it's not merely a display quirk — the wrong date is persisted. Every seeded expense showed a day behind entry; the two group expenses I entered on July 11 both display under "YESTERDAY."

**The compounding edit bug.** A Chipotle expense entered for Jul 5 displayed as JUL 4. I opened it, changed only the **cost** (23.75 → 28.50), saved, and it moved to **JUL 3**. The date regressed again despite my never touching the date field — so repeated edits walk an expense steadily backward in time.

**The balance inversion.** I (Review Tester) paid a $300 Airbnb split equally three ways, so Alice and Bob each owe me $100. The Balances *tab* correctly shows "Review Tester is owed $200 / Alice owes $100 / Bob owes $100," and the Settle-Up modal agrees ("Alice owes you $120"). But the right-hand **Balances panel** on the same screen labels Alice and Bob as "you owe −$100/−$120" and shows a nonsensical "Review Tester owes you" row for the current user. It's an isolated presentation bug in one component, but it's the first thing the eye lands on and it says the opposite of the truth.

## 4. Competitor Comparison

I researched each competitor's current feature set directly rather than assuming.

**vs. Splitwise** (the closest comparator for the group half). Splitwise offers receipt scanning *with item-level detection*, all the same split types plus **group default splits** ("set it and forget it" 55/45 for a couple), **simplify debts**, currency conversion, and optional card linking. TrackSpense matches the split *types* on paper (Equal, Exact, Percentage, Shares, Adjustment) and has the equivalent of simplify-debts ("who owes whom"), plus a cleaner settle-up with saved payment handles (Venmo/PayPal/UPI). But TrackSpense is *behind* on execution: its custom-split entry is broken, it has no group default split, and its receipt "parse" is unverified. **Net: comparable feature list, worse reliability, no card linking.**

**vs. Copilot Money** (the closest comparator for personal AI). Copilot's whole premise is **automatic bank/card import with a private per-user ML model that auto-categorizes ~90% accurately**, plus net-worth and investment tracking (stocks/crypto), subscription detection, and adaptive budgets. TrackSpense is **entirely manual entry** — no aggregation, no net worth, no investments, no budgets. Its AI "Ask" is a genuine peer to Copilot's new "Dispatch" natural-language layer, and its merchant/category analysis is comparable, but the data has to be typed in by hand. **Net: TrackSpense is well behind on the data-in problem, competitive on the insight-out problem.**

**vs. Monarch Money** (the closest comparator for households). Monarch does bank aggregation, flex/category budgeting, net worth, investment tracking, and **couples/household shared dashboards** with separate logins. TrackSpense's group feature overlaps the "shared" idea but is trip/bill-split-oriented, not a joint household budget; there's no budgeting, no bank sync, no investments. **Net: different product shape; Monarch is a full financial hub, TrackSpense is a lightweight tracker + splitter.**

**Where TrackSpense genuinely wins — the concept.** None of the three unify *personal spending* and *your share of group splits* into a single ongoing number. Splitwise knows your group balances but nothing about your solo coffee habit; Copilot/Monarch know your spending but can't split a dinner. TrackSpense's "one ledger for everything," its **Combined view**, and the dashboard's single blended figure are a real, defensible differentiator. Its privacy-first / no-bank-connection stance ("no ads, no clutter") is also a coherent positioning choice, even though it's the same choice that leaves it behind on auto-import.

**Where it's just different-but-comparable:** split types, settle-up mechanics, AI querying, and per-category/merchant analysis are all roughly at parity with the field — the ideas are there; the polish isn't yet.

## 5. Data Insights Quality

Above the "just a table of numbers" bar, though the interpretation is still shallow.

**Genuinely useful, interpretive touches:**
- The Dashboard leads with **"+94% vs last month"** and **"1 group still settling"** — framing, not just a number.
- **"What changed" cards** surface events, e.g., *"New merchant: ConEd — $112.30, first time here this month,"* with an "Ask about it →" hook into the AI.
- The **merchant drill-down** computes lifetime spend, visit count, average per visit, "what you buy here," and a plain-English read (*"Your average spend per visit is steady"*).
- The **AI "Ask"** answered *"How much did I spend on gas this month?"* with *"$52.10 on Gas this month"* and a transparency footnote — *"Looked at: This month · My Expenses"* — correctly excluding the group gas share. That scoping honesty is a nice trust signal.

**Where it stops short:** the interpretation is mostly single-sentence observation, not guidance. There's no budget-vs-actual, no forecast ("at this rate you'll spend $X"), no anomaly flag beyond "new merchant," and no category-level recommendation. A real user learns *what* happened but not yet *what to do about it*. Good foundation, thin ceiling.

**One thing to decide deliberately:** the Analysis totals blend personal and group-share spending (the $100 Airbnb share appears as "Hotel," group gas rolls into "Gas"). That's on-brand for "one ledger," but it isn't labeled, so a user auditing their personal spending may be confused by amounts that include group shares.

## 6. User Flow Complexity

Counted in real taps from a cold start on each screen:

- **Log an expense:** FAB → type description → type amount → Add. **~4 interactions**, and the merchant field auto-guesses the category, which removes a step. *Reasonable, even good.*
- **Check this month's spending:** it's the Dashboard hero number. **0 clicks.** *Excellent.*
- **Split a bill equally with a group:** open group → Add Expense → description/amount/category → Add (defaults to equal, all members). **~5 interactions.** *Reasonable.*
- **Split a bill by exact/%:** intended flow is one extra click on "equally" → pick type → enter amounts, but the input bug makes this **effectively impossible** to complete correctly. *Broken, not just long.*
- **See how much someone owes you:** group → Balances tab (or Settle Up). **1–2 clicks.** *Easy* — but the right-panel mislabel (see §3) actively misleads on the way there.

No flow is egregiously over-long; the problems are correctness, not step-count.

## 7. UI Understandability

A new user would find most screens self-explanatory: the nav labels are literal, the Dashboard's "Where it went" breakdown is obvious, "Repeat monthly" is clear, and empty states give a helpful nudge ("Create a group to split rent, trips, or shared bills").

Ambiguities worth fixing:

- **The recurring "Active / Paused" toggle is inverted.** With the switch **off**, the label reads "Active"; toggling it **on** (filled indigo) changes the label to "Paused." A filled/on switch that means "paused/inactive" contradicts the near-universal on = enabled convention and will cause users to set the opposite of what they intend.
- **The group Balances panel** (§3) is not just wrong, it's *unintelligible* — a "Review Tester owes you" row for the logged-in user has no sensible reading.
- **"Parse Receipt"** sits next to "Choose File" with no explanation of what it does (OCR? AI extraction?).
- **Category free-text vs. picker** (§1) means a user who learns the rich picker on the Dashboard meets a bare text box in the group/recurring flows and has to guess valid category names. I also saw the free-text category silently normalize ("Lodging" → "Hotel," "Dining" → "Dining out") with no indication it had changed my input.

## 8. Accessibility

Measured against WCAG 2.1 AA by reading computed styles and geometry directly from the DOM, not by eye.

**Color contrast — mostly good, with specific misses.**
- Dashboard passes comfortably: body text 16.97:1, secondary zinc-500 text 4.63:1 (just over the 4.5 bar), the red "+94%" 6.2:1.
- **The Expenses page fails AA in several places:** the date-separator headers (`JUL 8`, `YESTERDAY`) and their row-group amounts render at **4.19:1** (need 4.5), and the inactive segmented-control tabs (`Groups`, `Combined`, `Recurring`) at **4.24:1**. All just under the line — a small darkening of the zinc-400 tone would fix the set.
- Dark mode visibly mutes secondary text further; several labels look borderline there too.

**Keyboard navigation — weak.** Across *all* stylesheets there is exactly **one** `:focus-visible` outline rule (on a single component class); Plotly's stylesheet actively sets `outline: none`. The primary buttons compute `outline: none` and define no focus ring. In practice, a keyboard user gets **no visible focus indicator** on the vast majority of controls (nav, primary buttons, list rows, tabs). Elements are focusable, but you can't see where focus is.

**Screen-reader basics — good.** On the Expenses page, all 32 buttons expose an accessible name (icon-only buttons like "Ask AI," "Switch to dark mode," edit/delete all have labels), there are no inputs without an associated label, and the one `<img>` has alt text. This is the strongest accessibility area.

**Touch targets — many below the 44×44 minimum.**
- Row **edit/delete icons: 31×31** (the most-used list actions).
- Segmented tabs (Personal/Groups/Combined): **~22 px tall**.
- **"Add Expense" primary button: 35 px tall.**
- Top-bar icon buttons (Ask AI / theme / avatar): **42×42** (marginal).
- Footer links (Privacy/Terms/Help): **~21 px tall.**

**Motion — no reduced-motion support.** There are **zero** `prefers-reduced-motion` media queries, while the app uses modal, toast, and page-fade transitions. Users who request reduced motion at the OS level won't have it honored.

---

## Prioritized Fix List

Ranked by severity — fix the blockers before anything else; they concern the two things an expense-and-settle app cannot get wrong (dates and balances).

### P0 — Blocking / correctness (fix first)
1. **Date off-by-one on write.** `07/15` is persisted as `07/14`. Parse dates as local (or send/store as timezone-naive `YYYY-MM-DD`), don't round-trip through UTC midnight. This is the single highest-impact fix — it touches every expense.
2. **Compounding date regression on edit.** Ensure editing an expense doesn't re-apply the shift; saving an unchanged date must be idempotent. (Likely resolves alongside #1, but verify explicitly with an edit test.)
3. **Group Balances side-panel inversion.** Correct the sign/label logic so the panel matches the Balances tab and Settle-Up modal; drop the self-referential "you owe yourself" row for the current user.

### P1 — Major (blocks real use of a headline feature)
4. **Exact/Percentage split inputs.** Make the amount fields normal, selectable, replaceable numeric inputs; allow the current-user row to be edited or auto-balance it as the remainder. Custom splits are a core competitor-parity feature and are currently unusable.
5. **Percentage split rounding.** An even 3-way split defaults to 33.33×3 = 99.99 and fails the "must total 100" gate; auto-distribute the rounding remainder so an evenly-intended split validates out of the box.

### P2 — Consistency & clarity (cheap, high polish-per-effort)
6. **Unify the three add-expense forms** — or at minimum, use the structured category picker everywhere instead of free-text in the recurring and group flows.
7. **Fix the inverted Active/Paused toggle** so on = active.
8. **Standardize date format and container width** across Dashboard, Expenses, Account, and Groups.
9. **Label "Parse Receipt"** and confirm the receipt-upload path actually works end to end.
10. **Registration should auto-login** (or clearly confirm success and route to the dashboard) rather than dropping the user on the logged-out landing page.

### P3 — Accessibility
11. **Add visible focus indicators** app-wide (a single `:focus-visible` outline token applied to all interactive elements).
12. **Enlarge touch targets** to ≥44×44 — especially the edit/delete row icons (31→44) and the segmented tabs.
13. **Darken the sub-AA text** on the Expenses page (date headers, inactive tabs) to clear 4.5:1; re-check dark mode.
14. **Honor `prefers-reduced-motion`** for the modal/toast/fade transitions.

### P4 — Strategic (roadmap, not bugs)
15. To close the gap with Copilot/Monarch, the biggest lever is **reducing manual entry** — even optional receipt-parse-to-fill or CSV import would help, short of full bank aggregation. To press the advantage over Splitwise, lean into the **unified personal + group ledger** as the headline story, and consider **group default splits**. Deepen insights from observation ("new merchant") toward guidance (budgets, pace-of-spend forecasts).

---

*Evidence: this review is based on a live, seeded walkthrough of every reachable page and flow, DOM-level contrast/label/target measurements, and direct API probes (the date bug and balance behavior were confirmed against the `localhost:8080` API, not inferred from screenshots). Competitor feature sets were researched against current sources rather than assumed.*

### Competitor sources
- Splitwise — [splitwise.com](https://www.splitwise.com/), [Splitwise Pro](https://www.splitwise.com/pro), [SaaSworthy feature list (Aug 2025)](https://www.saasworthy.com/product/splitwise)
- Copilot Money — [copilot.money](https://www.copilot.money/), [Forbes Advisor review](https://www.forbes.com/advisor/banking/copilot-budget-app-review/), [Money with Katie review](https://moneywithkatie.com/copilot-review-a-budgeting-app-that-finally-gets-it-right/)
- Monarch Money — [monarch.com](https://www.monarch.com/), [NerdWallet review](https://www.nerdwallet.com/finance/learn/monarch-money-app-review), [Monarch tracking features](https://www.monarch.com/features/tracking)
