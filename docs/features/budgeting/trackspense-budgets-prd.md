# TrackSpense — Budgets & Spending Limits
## Product Requirements Document (PRD)

**Status:** Draft v1 · **Owner:** Product · **Related:** Pre-Launch Audit (Product Gap #2)
**Depends on:** unified balance engine, Analysis `scope` model, recurring engine, notification/AI layer

---

## 1. Summary

TrackSpense already tells users *where their money went* (the "Where it went" breakdown, the Analysis page, and the "What changed → Ask why" insights). Budgets closes the loop by telling them *where their money is going* — a forward-looking limit users set per category (and overall), tracked in real time against the **same unified personal + group ledger** that is TrackSpense's core differentiator.

The killer detail: because every user's *share* of a group split already flows into their personal total, a TrackSpense budget can be **honest** in a way single-purpose budgeting apps are not — a $60 dinner split three ways counts as $20 against your "Dining out" budget automatically. No competitor that treats personal and shared spend as separate silos can do this cleanly.

---

## 2. Problem & customer expectation

**What customers expect** (table-stakes for any expense tracker):
- "Let me set a monthly limit for Dining out / Groceries / overall and warn me before I blow it."
- "Show my budget on the same screen where I see my spending."
- "Tell me early — not on the 30th — that I'm trending over."

**Why today's experience falls short:** TrackSpense is entirely *retrospective*. A user can see they spent $230 on Dining out this month but was never given a target, a pace indicator, or a heads-up. There is no notion of a limit anywhere in the product.

**The TrackSpense-specific expectation** (raised by our own value prop): "Since you already fold my group shares into my personal total, my budget should count them too — I shouldn't have to track shared spend in a second app."

---

## 3. Goals / Non-goals

**Goals**
- Let users set and track monthly limits: overall, per-category, and (later) per-group.
- Track budgets against the unified ledger, respecting the existing personal / group / **combined** scope model.
- Warn *proactively* (pace-based) via the existing insight + notification surfaces, not just at 100%.
- Reuse existing primitives — categories, `scope`, recurring, multi-currency, the "Where it went" and Analysis UIs — so Budgets feels native, not bolted on.

**Non-goals (v1)**
- Envelope/zero-based budgeting, sinking funds, or multi-month goal saving.
- Income tracking or net-worth. (TrackSpense is expense-first.)
- Bank sync / predictive auto-budgets from history beyond a simple suggestion.
- Shared/collaborative *group* budgets with member voting (deferred to v2 — see §11).

---

## 4. Personas & top user stories

**Persona A — "Solo tracker" (primary).** Wants a personal monthly cap on discretionary categories.
- As a user, I set a $250/month Dining out budget and see a live bar of $230 / $250 on my dashboard.
- As a user, I get a nudge on ~day 18 that I'm "on pace to hit $310 — 24% over."

**Persona B — "Roommate / trip splitter" (differentiator).** Shares a home group (like the "RSJ" group).
- As a user, I want my share of group groceries to count against my personal Groceries budget automatically.
- As a user, I can toggle whether a budget is measured on *personal-only* or *combined* spend, matching the Analysis "Include group shares" toggle.

**Persona C — "Recurring-aware planner."** Has recurring bills (Electricity, TV/Phone/Internet).
- As a user, my budget shows committed recurring spend for the month so the "remaining" figure is trustworthy.

---

## 5. Feature scope — what we offer

### 5.1 Budget objects
A **Budget** is: `{ scope, target_type, category?, amount, currency, period, rollover, alert_thresholds, start }`.

- **Target type:**
  - **Overall budget** — one cap across all categories for the period.
  - **Category budget** — a cap on a single category from the existing taxonomy (Car, Groceries, Dining out, Electricity, Services, TV/Phone/Internet, Food & Drink, Education, Sports, Movies, General, …). Categories stay in lock-step with the app's category list.
- **Scope** (mirrors the Analysis endpoint exactly): `personal` | `combined` (personal + my group shares). `group`-scoped budgets are v2.
- **Period:** monthly (v1 default, aligns with the app's month-based Analysis). `weekly` behind a flag; `custom` deferred.
- **Rollover (optional):** carry unused/overspent remainder into next period (off by default).
- **Currency:** the user's base currency; group shares are converted using the same `fx_rate_to_group_currency` logic already used in group expenses.

### 5.2 Live tracking & the "pace" concept
For the active period we compute, in real time off the same ledger read that powers "Where it went":
- **Spent** — actual to date (respecting scope).
- **Committed** — remaining recurring/known charges due this period (from the recurring engine).
- **Remaining** = `amount − spent − committed`.
- **Pace / projected** = `spent / fraction_of_period_elapsed`, i.e. straight-line projection to period end. This drives *early* warnings.
- **Status:** `on_track` (projected ≤ amount), `at_risk` (projected 100–110%), `over_pace` (projected > 110%), `exceeded` (spent > amount).

### 5.3 Alerts (reuse the insight + notification layer)
- Threshold alerts at configurable %s (default 80%, 100%) — surfaced as a "What changed"-style insight card and a push notification.
- **Pace alert** (the differentiator vs. dumb 100%-only apps): once ~40% of the period has elapsed and `projected > 110%`, fire *"On pace to exceed Dining out by ~$60."*
- Respect the existing group **mute** setting and add a per-budget mute. No duplicate spam: max one pace alert + one threshold alert per budget per period unless the user re-crosses.

### 5.4 AI integration (extend "Ask why")
- Every budget card gets an **"Ask why"** affordance that hands the model the budget + the contributing transactions and returns a plain-language explanation ("You're over because of 3 dinners > $40 and a Costco run").
- **Suggested budget** on setup: from the last 3 months' median category spend, propose a starting amount (one tap to accept). This is a suggestion only — no auto-enforcement.
- All AI output must pass through the sanitization/encoding rules from the security remediation (never render reflected transaction text as raw HTML).

---

## 6. UX / design

**Design principle:** budgets appear *next to the spend they govern*, never on a separate island.

1. **Dashboard.** The "Where it went" list gains an optional budget affordance: for any category with a budget, show a thin progress bar and `spent / limit` with a status color. Add a compact **"Budgets" summary card** (e.g. "3 of 5 on track · 1 at risk") linking to the full view. A user with zero budgets sees a single dismissible "Set a budget" prompt — no clutter.
2. **Analysis page.** In the category breakdown, each row shows budget progress inline and honors the existing **Month/Year** and **Include group shares** toggles (the latter maps to budget `scope`). This is the natural home because users already reason about categories here.
3. **Budgets view (new).** A dedicated page/tab: list of budgets with pace bars, projected end-of-period figures, and status chips (`on_track` / `at_risk` / `over_pace` / `exceeded`). Create/edit in a modal that matches the New Expense modal's visual language (amount keypad, category picker, scope toggle, threshold chips).
4. **New Expense modal.** After saving an expense in a budgeted category, the success screen shows a one-line budget delta ("Dining out: $230 → $250 of $250 — limit reached"), reinforcing the loop at the moment of spend.
5. **Visual states.** Under (green) / near (amber, ≥80% or at-risk pace) / over (red). Bars must handle overflow gracefully (cap at 100% width with an "over by $X" tag) — apply the same anti-overflow rule required for the amount field fix.

**Accessibility/responsive:** progress bars need text labels (not color-only) for status; verify on 375px per the mobile remediation item.

---

## 7. Functional requirements

| ID | Requirement |
|----|-------------|
| FR-1 | User can create an overall or per-category monthly budget with amount, scope (personal/combined), and optional rollover. |
| FR-2 | Only one budget may exist per (scope, category, period-type) at a time; creating a duplicate edits the existing one. |
| FR-3 | Spent is computed from the unified ledger with the same scope semantics as `GET /api/v1/analysis` (combined includes the user's group *share*, not the full group expense). |
| FR-4 | Remaining reflects committed recurring charges due within the period. |
| FR-5 | Projected/pace value is recomputed on each ledger write and on schedule (daily) for alerts. |
| FR-6 | Threshold + pace alerts fire per §5.3, deduped, and honor mute settings. |
| FR-7 | Editing a budget mid-period recomputes status immediately; history for past periods is immutable (snapshot per period). |
| FR-8 | Deleting a budget stops tracking/alerts but retains past-period snapshots for the Analysis history. |
| FR-9 | Multi-currency: group-share amounts are converted to the budget currency before summing. |
| FR-10 | Budgets are private to the user (v1); enforced by the same JWT-derived identity model — never accept a client-supplied user id. |

---

## 8. Data model & API (aligned with existing `/api/v1` + FastAPI/Pydantic patterns)

**Table `budgets`** (money as `Decimal`, per the audit fix):
```
budget_id (uuid, pk)
user_id (from JWT sub — never client-supplied)
scope           enum: personal | combined
target_type     enum: overall | category
category        text | null      # null when overall
amount          numeric(12,2)
currency        text
period_type     enum: monthly (| weekly flag)
rollover        bool
alert_thresholds int[]           # e.g. {80,100}
muted           bool
start_date, created_at, updated_at, deleted_at (soft delete)
```
**Table `budget_period_snapshots`** — immutable per closed period: `budget_id, period_start, period_end, amount, spent, status`.

**Endpoints**
- `GET /api/v1/budgets?scope=&period=YYYY-MM` → list with live `spent / committed / remaining / projected / status`.
- `POST /api/v1/budgets` → create (422 on amount ≤ 0 / > max / bad precision; conflict → edit existing per FR-2).
- `PATCH /api/v1/budgets/{id}` · `DELETE /api/v1/budgets/{id}` (soft).
- `GET /api/v1/budgets/{id}/breakdown` → contributing transactions (feeds "Ask why").
- `GET /api/v1/budgets/suggestions?scope=` → median-based suggested amounts.
- Reuse `analytics/changes` insight pipeline to emit budget alert cards.

**Consistency requirement:** the `spent` figure returned here MUST use the *same* balance/scope function unified in the audit's balance-consistency fix — do not create a third calculation path.

---

## 9. Edge cases

- **Refund / negative-effect corrections** and expense edits/deletes must retro-adjust `spent`.
- **Category recategorized** (e.g. AI reassigns "General" → "Dining out") moves the amount between budgets.
- **Timezone / period boundary:** define period in the user's timezone; a 11:59pm-on-the-last expense counts to the correct month.
- **Mid-period budget creation:** pace uses elapsed fraction from period start, not budget creation date (or offer "prorate from today" — decide in design).
- **Combined scope + later group deletion:** a group's deletion (soft) should not retroactively corrupt prior-period snapshots.
- **Zero/over budgets:** amount must be > 0 (reuse FR validation); UI must render "over by $X" without layout overflow.
- **Multi-currency group with FX gaps** (`fx_rate_to_group_currency: null`): define fallback (skip vs. estimate) and surface a "partially estimated" note.

---

## 10. Success metrics

- **Adoption:** % of active users with ≥1 budget within 14 days of launch (target: 30%).
- **Engagement/retention:** 4-week retention of budget-setters vs. non-setters (expect lift).
- **Efficacy:** % of budgeted categories where users stay within limit month-over-month; % of pace alerts that precede an actual overage (precision of the early-warning).
- **Differentiator signal:** % of budgets using `combined` scope (validates the unified-ledger value).

---

## 11. Phasing

**MVP (v1)** — FR-1…FR-10: personal + combined monthly category and overall budgets, live tracking with pace, threshold + pace alerts, dashboard/Analysis integration, suggested amounts, "Ask why."

**v1.1** — weekly period, rollover polish, budget-delta on expense-save screen, richer projections (weekday-weighted instead of straight-line).

**v2** — **Group budgets:** a shared cap for a whole group (e.g. "trip food budget $600") visible to all members, with per-member contribution tracking — a natural extension of the group ledger and settle-up flows. Requires member roles/permissions and collaborative edit rules.

---

## 12. Open questions

1. Straight-line pace vs. weekday/seasonality-weighted for v1? (Straight-line is simpler and explainable.)
2. Should overall and category budgets coexist and double-count, or should overall be "the rest"? (Recommend: they coexist and are shown independently; document clearly.)
3. Prorate a mid-period new budget, or measure full-period? (Design to decide.)
4. Notification channel priorities — in-app insight card only for v1, or push from day one?
5. Do we expose budgets in the per-group CSV/personal export? (Recommend: yes, as a separate section.)
