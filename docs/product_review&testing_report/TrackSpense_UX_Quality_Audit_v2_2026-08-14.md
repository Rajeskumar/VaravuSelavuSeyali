# TrackSpense — Product Quality & UX Audit v2 (Re-audit)

**Date:** August 14, 2026
**Auditor:** Independent review for Rajesh (product owner)
**Subject:** https://expense.cerebroos.com (web), code-level review of the repo at HEAD (last commit Aug 14, 2026)
**Previous audit:** July 11, 2026

## Method and limits

Same approach as v1: the live site is a client-rendered SPA, so unauthenticated fetches see only the HTML shell; live findings are limited to what the shell exposes. Everything else was verified directly in source — the ~30 commits landed since the last audit (cookie-auth migration, prelaunch-remediation branch, Budgets MVP, live-testing fixes, domain mapping), the backend test suite, and every item on v1's must-fix list. No login attempted. One caveat: edge-level HTTP security headers (CSP, HSTS, X-Frame-Options) can't be verified from here — nothing sets them in the FastAPI app, so confirm your hosting layer does.

---

## Scorecard: what happened to v1's seven must-fixes

| # | v1 must-fix | Status | Evidence |
|---|---|---|---|
| 1 | Fix registration end-to-end | 🟡 **Half fixed** | Auto-login after signup now works (register → login → dashboard, verified in `RegisterPage.tsx`). But **phone is still a required field**, and errors are still the generic "Registration failed." |
| 2 | Replace CRA boilerplate metadata | 🟡 **Barely started** | Theme-color is now brand purple `#5E48C8` (verified live — a deploy shipped it). But the live meta description is **still "Web site created using create-react-app"**, there are still **zero Open Graph / Twitter tags**, and the title is still "TrackSpense App." |
| 3 | Resolve the currency contradiction | 🟡 **Backend yes, UI no** | Real multi-currency landed server-side: per-expense currency, `fx_rate_to_group_currency`, and a `test_multi_currency.py` suite. But every displayed amount still hardcodes `$` (`formatMoney`, GroupsPage hero, BalanceList, GroupBalancesPanel, settle-up adornment). The detail dialog now renders the hybrid `"$25.00 EUR"` — arguably worse than before. |
| 4 | Surface real auth errors | ❌ **Not done** | Login still says "Invalid credentials or server error"; register still says "Registration failed." (The backend's deliberately generic register response is correct anti-enumeration practice — but the frontend can still distinguish rate-limiting, network failure, and validation, and doesn't.) |
| 5 | Budgets: ship or remove | ✅ **Shipped properly** | Full Budgets MVP: backend API + tests (`test_budgets_api.py`), Budgets tab in Analysis, dashboard summary card, budget progress bars in the category breakdown, per-budget mute, and AI "Ask why" grounded in real transactions. The old localStorage stub card is dead code (no longer imported anywhere) — delete the file, but it's not user-visible. |
| 6 | Automated IDOR test | ✅ **Done, and then some** | `test_do_not_regress.py` covers exactly what was asked: `user_id` query-param overrides ignored on `/expenses` and `/analysis`, non-members 403'd on every group subresource, forged cookies / `alg=none` / wrong-secret / refresh-as-access tokens all rejected. Historical log purge remains unverifiable from code. |
| 7 | Landing-page trust block | ❌ **Not done** | `HomePage.tsx` is unchanged — still claims "privacy-first" with zero substantiation, no screenshots, no data-handling statement. |

**Net: 2.5 of 7 closed, and the two hardest ones (5, 6) are among them.** What's left is mostly copy and metadata — cheap work that keeps not happening.

---

## What actually improved (and it's a lot)

### Security posture — transformed

This is no longer the same product, security-wise. Since v1: JWTs moved from localStorage into **HttpOnly cookies** with **CSRF tokens** echoed and rotated, **refresh-token rotation with database-backed revocation**, rate limiting on the auth surface (5/hr register, 5/min login, 20/min refresh), **fail-fast on a weak JWT secret**, input sanitization with output-sink encoding and bounded amounts (client mirror in `utils/amount.ts`, server authoritative at 422), email-content escaping with tests, and a proper API domain (`api.cerebroos.com`) that fixes the cross-origin cookie problem. The regression suite locks all of it in place. `RequireAuth` is now correctly documented as a routing hint, not the security boundary. For a solo project this is a credible, launch-grade auth model — the v1 "credibility-killer" category is closed.

### Features closed real competitive gaps

Budgets (the table-stakes gap called out in v1) shipped as a real feature with an AI hook nobody else has ("Ask why" on an over-budget category answers from your actual transactions). CSV export shipped for both the personal ledger and groups — a v1 nice-to-have. Also new since v1: a natural-language **quick-capture sheet** with merchant autocomplete, an **entity-resolution / merchant-mapping** service (the fuzzy-matching gap FEATURE_STATUS had flagged), settle-by-expense, split suggestions, itemized line-item viewing/editing on group expenses, notification preferences, expense date editing, a Money-Flow Sankey replacing the treemap, react-query caching on analytics screens, logged-in users bounced away from auth pages, and a mobile responsive test suite that found and fixed real touch-target violations. Group list vs. detail balance disagreement — a correctness bug — was found and fixed.

### UI/UX quality

The v1 assessment stands: the design-token discipline, dark mode, and the Groups experience remain the product's strengths, and the new components follow the same system. The brand accent evolved (now `#5E48C8` family, consistent live and in-app). Amount inputs now get inline bounds errors instead of failed saves.

---

## What's still wrong

The pattern from v1 has repeated: **deep, hard engineering work gets done; the shallow front-door work doesn't.** Concretely, still true today:

1. **The shared-link experience is still broken.** Meta description is still the CRA default — every link shared to Slack/iMessage/WhatsApp still previews as "Web site created using create-react-app." No OG tags, no social image. This was v1's item 2, it's an hour of work, and it's the single most public-facing defect the product has.
2. **Phone is still required at signup.** Still a bounce-driver, still no visible product justification (there's no SMS feature).
3. **Currency display is still hardcoded `$`** — now with more backend behind it, which makes the display gap stranger. A group set to EUR with correct fx conversion server-side still shows dollar signs on every balance. One shared `Intl.NumberFormat`-based formatter taking the group currency would close this everywhere; the pieces all exist.
4. **Auth error copy is still generic.** Rate-limited users (5/min login!) will see "Invalid credentials or server error" and retry into the limiter.
5. **"Privacy-first" is still an unsubstantiated claim** on the landing page — more conspicuous now, because the product actually earned the claim with the cookie/CSRF/revocation work and doesn't say so.
6. **`window.confirm` still guards destructive actions** (expense delete, group archive/delete) — native browser chrome in an otherwise designed product, no undo.
7. **Accessibility unchanged** — still ~18 files with any `aria-label`, no skip link.
8. **Still CRA + full plotly.js** — the deprecated toolchain and multi-MB chart dependency both remain; first-load weight is unchanged since v1.
9. **No email verification** at signup (unverified addresses will eventually collide with group invites and password recovery).

---

## Competitive position (delta since v1)

The July analysis holds, with two upgrades. Against **Splitwise**, TrackSpense previously matched Pro on splitting features but lost on multi-currency; the backend fx work means it now nearly matches there too — only the display layer gives it away. CSV export removes another Pro-only differentiator. The free-vs-$5/mo argument is stronger than ever.

Against **Monarch/YNAB**, the budgets gap — v1's disqualifier — is now closed at MVP level, with an AI explanation feature neither competitor offers. Bank sync remains the honest dividing line: TrackSpense is still a manual-entry + receipt-OCR product, so it still shouldn't market itself as a full personal-finance manager. But "budgets, spending intelligence, and group splitting in one free app" is now a true sentence, and no competitor can say it.

---

## Launch-readiness verdict

**GO — with a one-day punch list.** (v1 was "conditional go"; the conditions are now mostly met.)

The two things that made v1 conditional — security credibility and the budgets table-stakes gap — are resolved, and resolved well: cookie auth with rotation/revocation plus a regression suite proving the IDOR class is dead, and a real Budgets feature. Nothing remaining is architectural. What's left is the same front-door polish v1 asked for, and it's small enough that shipping without it would be a choice, not a constraint.

### Must-fix before announcing (≈1 day total)

1. **Metadata, finally** — real meta description, OG + Twitter tags with a social image, a proper title. An hour. Do this first; it's been open across two audits and it's the first thing every prospective user sees.
2. **Make phone optional** (or delete the field). Minutes.
3. **One currency-aware money formatter** wired through group surfaces (hero, balance list, side panel, settle-up, feed). The backend data is already there. Half a day.
4. **Differentiate auth errors** — at minimum: rate-limited ("Too many attempts — wait a minute"), network failure, and invalid credentials. An hour.
5. **Privacy/trust block on the landing page** — you built HttpOnly-cookie auth, token revocation, deletion, and export; say so in three sentences. An hour, mostly writing.

### Nice-to-have (carry-forward + new)

1. Themed confirm dialogs + undo for deletes (replace the four `window.confirm` sites).
2. Email verification at signup.
3. Accessibility pass (icon-button labels, skip link, axe audit).
4. CRA → Vite migration and code-split/replace plotly.js.
5. Delete the dead `BudgetVsActualCard.tsx` (its on-screen "set budgets via localStorage" tip must never resurface).
6. Verify edge security headers (CSP, HSTS, X-Frame-Options) on the hosting layer — nothing in the app sets them.
7. Reviewer/demo seed script for app-store review (still ad-hoc).
8. Confirm the historical log-purge of pre-fix PII actually happened (unverifiable from code).

### Bottom line

Since July you fixed the hard 20% I said was already 80% done — the security work in particular is beyond what I asked for, and budgets shipped as a real feature rather than a checkbox. But the five cheapest items on the list, the ones users hit in their first sixty seconds, survived a second audit untouched: the link preview still says "create-react-app," signup still demands a phone number, and a EUR group still shows dollar signs. That's one focused day. Spend it, then launch — this product is now materially better than free Splitwise and has no remaining excuse to stay quiet.

---

## Sources

- Live site inspection (Aug 14, 2026): https://expense.cerebroos.com — shell meta tags (description unchanged, theme-color now `#5E48C8`)
- Source review at HEAD (commit `dd2aaaf`, Aug 14, 2026): `varavu_selavu_ui/src` (auth pages/API, GroupsPage, budgets components, formatters, index.html), `varavu_selavu_app` (auth routers, tests incl. `test_do_not_regress.py`, `test_auth_cookies.py`, `test_budgets_api.py`, `test_multi_currency.py`, export tests), git history July–August 2026
- Competitive baseline carried from v1 audit (July 2026): [Splitwise Free vs. Pro 2026](https://www.areweeven.com/blog/splitwise-free-vs-pro-2026) · [Monarch vs YNAB](https://www.fool.com/money/personal-finance/monarch-money-vs-ynab/) · [CNBC best expense trackers 2026](https://www.cnbc.com/select/best-expense-tracker-apps/)
