# TrackSpense — Live QA Findings & Implementation Plan

> Tested against the running app at `localhost:3000` (web) using a real browser session, real data, and network/console inspection — not just visual inspection. The native mobile app (Expo/RN) remains untested; see §5.

---

## 1. Corrections to earlier assumptions

Two things reported as bugs turned out to already work when tested directly. Recording this so effort isn't wasted re-fixing what isn't broken.

| Reported issue | What I found |
|:---|:---|
| Group Detail missing "Add Expense" | **Already fixed, and more capable than expected.** The button is present and opens a sheet with real split modes — Equal / Exact / Percentage / Shares / Adjustment — plus a live "Split reconciles ✓" indicator. |
| Auto-categorization broken on group expenses | **Reproduced the opposite.** Typed "Starbucks coffee" into a group expense description; watched `POST /expenses/categorize` fire and return 200; Category field populated with "Dining out" moments later. Also tested on a Recurring template ("Netflix Subscription" → auto-filled "Movies"). Both worked. If you're still seeing failures, the cause is more specific than "categorization is broken" — worth noting the exact expense/description next time it happens. |

## 2. Confirmed real, with evidence

| Issue | Evidence |
|:---|:---|
| **No share-link group invitation exists** | Opened "Add Member" on a live group. It offers exactly two modes: "Registered email" and "Placeholder name" (tested — works). No link-generation, no share-sheet integration, anywhere. This is a feature that was never built, not a broken one. |
| **Recurring expense (Dashboard vs. Expenses) — not reproduced via manual trigger** | Created a real recurring template, ran `execute_now` directly (confirmed via network: 200), and the resulting expense appeared correctly and immediately in *both* Dashboard's Recent feed and the Expenses list. I could not reproduce the reported mismatch this way. This narrows the search: if it's real, it likely only shows up via the **login auto-prompt confirm flow** specifically, or is a **caching/timing** issue (stale React Query or analysis cache) rather than an immediate one — not a blanket "recurring expenses don't sync" bug. |
| **Session logout during testing** | Navigating to `/recurring` after an idle period unexpectedly cleared *both* `vs_token` and `vs_refresh` and bounced to `/login` — a full logout, not just an expired access token (which should have silently refreshed). Re-tested afterward with normal navigation and it didn't recur, so this looks tied to idle duration rather than a specific action. Worth a look at the token-refresh interceptor's behavior after a long idle gap. |
| **Container width is inconsistent — now pinned to two specific, precise causes** | Not a vague "some pages feel different" — I measured it. (1) The authenticated app pages (Dashboard, Expenses, Analysis, Item/Merchant Insights, Recurring, AI Analyst) all consistently use `MuiContainer maxWidth="lg"` (1200px) — **except** Feature Request, which uses `maxWidth="sm"` (600px) instead, for no apparent reason. (2) The public pages (Login, Forgot Password, and by inference Register/Home) use **no MuiContainer at all** — full-bleed, `maxWidth: none`. One shared page-shell component, used everywhere, would eliminate both causes at once. |
| **Dashboard's inner content doesn't use its container width at desktop size** | Distinct from the above: even inside the correct 1200px frame, Dashboard's actual content (True Total, Recent list) renders as a narrow, centered column with large dead space either side at desktop widths — looks like the mobile-first prototype's narrow width was carried over as-is rather than adapted. Every other page uses the available width properly. |
| **Copy/pluralization bugs** | "1 purchases" (Item Insights), "1 visits" (Merchant Insights) — singular/plural not handled. "My Expense" (singular) still appears on the lens control in at least one place, despite the "My Expenses" rename. Two "Add Expense" buttons on the same Group Detail page with inconsistent capitalization ("Add Expense" vs. "Add expense"). |

## 3. Confirmed working well

- **Dark mode**: background measures exactly `rgb(25,26,30)` — the `ink` token — with heading contrast at 15.92:1 against it (WCAG AAA is 7:1). Jade is correctly brightened for dark backgrounds.
- **Body background** in light mode is exactly `rgb(247,247,244)` — the `paper` token — everywhere I checked.
- **Web responsive behavior at phone width** (~500px) is reasonable: MuiContainer correctly goes fluid, Dashboard renders its hero/lens/spectrum/groups/recent sections correctly at that width.
- **Much of the redesign is already live**: Analysis has the tap-a-month trend bars and "What Changed" section; AI Analyst has the Fast/Deep picker and suggested prompts with no scope dropdown; Merchant Insights has an "Ask AI" button (the ambient-chat pattern) right on the detail page.
- Group Detail's Balances tab, Activity tab, and the multi-mode split UI are more capable than what I'd prototyped — good foundation to design onto, not around.

## 4. Prioritized implementation plan

**Fix now, independent of the redesign (small, high-confidence, unrelated to visual work):**
1. One shared page-layout component for *all* pages (public and authenticated) — resolves the container inconsistency at its root instead of patching each page.
2. Feature Request page: change `maxWidth="sm"` to match the rest of the app (or justify why it's different, if intentional).
3. Pluralization on count labels ("purchase"/"purchases", "visit"/"visits").
4. "My Expense" → "My Expenses" — finish the rename everywhere.
5. Standardize "Add Expense" button capitalization across Group Detail.
6. Investigate the idle-session full-logout behavior — token refresh interceptor after long idle gaps.

**Needs a design decision before building (not pure bugs):**
7. Share-link group invitation — genuinely doesn't exist. Decide whether to build it (Splitwise-pattern: generate a joinable link, share via OS share sheet, deep-link into the group) before scoping a ticket.
8. Dashboard's inner content width at desktop — this is the actual redesign work (give it a proper responsive layout instead of the fixed narrow column), not a quick fix.

**Needs more targeted reproduction before it can be fixed:**
9. Recurring-expense Dashboard/Expenses mismatch — test via the login auto-prompt confirm flow specifically (not manual "Run now"), and check React Query cache invalidation timing after a recurring expense is created.

## 5. Still outstanding

- **The native mobile app (Expo/RN) remains completely untested** — no emulator or device access in this environment. This needs screenshots/recordings per screen from you, or read access to the mobile source, to close this gap.
- Full accessibility contrast audit is partial — dark mode heading contrast is confirmed good; button-level contrast in light mode across jade/ember interactive elements hasn't been systematically checked yet.
