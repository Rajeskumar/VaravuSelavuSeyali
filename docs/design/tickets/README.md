# TrackSpense "Reconcile" UX Redesign — Implementation Tickets

Tickets for the **Reconcile UX Redesign** — a separate, sequential initiative from TrackSpense Groups.
Groups (`TS-GRP-1xx`, see [`../../features/tickets/`](../../features/tickets/)) shipped first; this
redesign follows it and re-skins/restructures the app, including the Groups UI it produced.

**Sole source of truth for this ticket set:**
- [`../TrackSpense_UX_Design_Spec.md`](../TrackSpense_UX_Design_Spec.md) — the "Reconcile" design language
- [`../TrackSpense_UX_Audit_and_Redesign.md`](../TrackSpense_UX_Audit_and_Redesign.md) — the audit + ranked backlog
- [`../ORIENTATION_REPORT.md`](../ORIENTATION_REPORT.md) — the delta against the current codebase

**`docs/features/TrackSpense_Groups_Product_Spec.md` is explicitly out of scope for this ticket set.**
Its §11.2/§17.1 "dashboard layout unchanged" language describes the Groups initiative's own scope
only, decided before this redesign existed. It does not govern `TS-DES-1xx` and is not referenced,
reconciled against, or edited by any ticket below.

## Execution order

| Order | Ticket | Title | Depends on |
|:--|:--|:--|:--|
| 1 | [TS-DES-101](TS-DES-101-reconcile-tokens.md) | Reconcile tokens module (web + mobile) | — |
| 2 | [TS-DES-102](TS-DES-102-expenses-feed-rebuild.md) | ExpensesPage rebuild — unified day-grouped feed | 101 |
| 2 | [TS-DES-103](TS-DES-103-dashboard-rebuild.md) | DashboardPage rebuild — True Total + lens | 101 |
| 2 | [TS-DES-105](TS-DES-105-chart-restyle.md) | Restyle Plotly (web) + chart-kit (mobile) | 101 |
| 3 | [TS-DES-104](TS-DES-104-groups-ui-restyle.md) | Restyle already-built Groups UI + settle-up hero/count-to-zero | 101 |
| 4 | [TS-DES-107](TS-DES-107-item-insights-rebuild.md) | Item Insights rebuild | 101 |
| 4 | [TS-DES-108](TS-DES-108-merchant-insights-rebuild.md) | Merchant Insights rebuild (sequence with/after 107 for row-component reuse) | 101 (soft: 107) |
| 4 | [TS-DES-110](TS-DES-110-recurring-rebuild.md) | Recurring rebuild | 101 |
| 4 | [TS-DES-106](TS-DES-106-expense-analysis-rebuild.md) | Expense Analysis rebuild | 101, 105 |
| 4 | [TS-DES-109](TS-DES-109-ai-analyst-rebuild.md) | AI Analyst rebuild | 101 |

**Sequencing rule (batch 1, 101–105):** 101 is the sole blocker for everything else — nothing else
depends on being blocked by it beyond needing its tokens to exist. 102, 103, and 105 have no
dependency on each other and may proceed in any order once 101 lands. 104 is scheduled last **only**
because it depends on 101's tokens being stable (a second pass over already-shipped Groups UI is
wasted work if the token values are still moving) — it does **not** depend on 102, 103, or 105.

**Sequencing rule (batch 2, 106–110):** 107, 108, and 110 have no cross-team dependency and can go
first — 108 is best sequenced with or after 107 for row-component reuse (soft, not hard). 106's lens
switch and 109's "Looked at: ..." scope-resolution chip are each **partially gated on other,
out-of-initiative work** (Groups' per-category three-money-view data for 106; a net-new, currently
unscoped backend intent-resolution capability for 109 — see each ticket's own notes for exactly what
that means, since neither is simply "waiting on an in-flight ticket"). Both tickets build their full
UI now regardless and document precisely which parts are cosmetic-only until that other work lands
— this is not a reason to delay either ticket's implementation.

This is a ticket-authoring pass only — **no implementation code has been written for 102–110**;
101's status reflects what already exists in the repo (see that ticket). All ten are gated for
review before any build work starts, matching the review gate used for `TS-GRP-1xx`.
