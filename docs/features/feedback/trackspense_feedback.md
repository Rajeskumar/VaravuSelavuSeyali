# Trackspense / CerebroOS — Launch Checklist

*Derived from the consolidated top-5 priorities. Ordered so that blockers come first. Check items off as you go; sub-items are the concrete work under each priority. Suggested owner in brackets — adjust to your team.*

> Re-verified against the codebase 2026-07-04 — see [FEATURE_STATUS.md](../FEATURE_STATUS.md) for the analytics/AI feature backlog (a separate, larger set of gaps not covered by this checklist).

**Status key:** `[ ]` not started · `[~]` in progress · `[x]` done

---

## Priority 1 — Fix the two credibility-killers (auth + AI)  ⛔ blocker

*Nothing else ships safely until these are done.*

**Auth / data security**

- [x] Confirm whether the backend derives the user from a validated session token or trusts the `user_id` query param  [backend]
- [x] If it trusts the param: enforce server-side that the authenticated session must match the requested `user_id` (fix the IDOR)  [backend]
- [x] Stop passing email/PII in URLs and query strings; move identity to the auth token / headers  [backend]
- [ ] Add an automated test that a logged-in user cannot read another user's data by changing the id  [backend]
- [ ] Audit server logs / analytics to purge any already-captured emails in URLs  [backend]

**AI Analyst**

- [x] Move the AI provider API key server-side; never expose provider/model/keys in the client  [backend]
- [x] Resolve the OpenAI billing/quota so the feature actually responds  [ops]
- [x] Add per-user rate limits and a cost cap so one user can't exhaust quota  [backend]
- [x] Replace raw upstream errors (e.g. the `429 insufficient_quota` text) with friendly fallback messages  [frontend]
- [ ] Decide + document what financial data is sent to the model, and minimize/anonymize it  [product]

---

## Priority 2 — Close the table-stakes gap (Budgets + goals)  ⛔ blocker

- [x] Decide: ship Budgets now, or remove it from all UI/marketing until it exists  [product]
- [ ] Build the Budgets screen: category budgets vs. actuals with progress indicators  [frontend + backend]
- [ ] Add basic savings goals (target amount + progress)  [frontend + backend]
- [x] Fix the blank `/budgets` route (404/redirect if not shipping, real page if shipping)  [frontend]
- [ ] QA budgets across empty state, over-budget, and mid-month states  [QA]

---

## Priority 3 — Launch legal + trust foundation (web + mobile)  ⛔ blocker

- [x] Publish the Privacy Policy at a stable public URL (draft provided)  [legal/founder]
- [x] Publish Terms of Service at a stable public URL (draft provided)  [legal/founder]
- [ ] Have a lawyer review both before public launch  [legal]
- [x] Link Privacy + Terms in the site footer  [frontend]
- [x] Link Privacy + Terms inside the app (and in app-store metadata)  [frontend]
- [ ] Complete Apple App Privacy ("nutrition label") — must match actual data flows incl. AI  [product]
- [ ] Complete Google Play Data Safety form — must match actual data flows  [product]
- [x] Confirm in-app account deletion works and clearly deletes data (add confirmation step)  [frontend + backend]
- [ ] Create a reviewer demo account for the app stores  [ops] — *note: an ad-hoc test account (`demo@trackspense.app`) with ~30 sample expenses was created during a 2026-07-04 session for screenshot purposes. It is not a documented/reproducible seed process and should not be treated as satisfying this item — a real seed script + documented credentials still needed*

---

## Priority 4 — Relaunch the homepage to sell Trackspense  🔵 high

- [x] Replace abstract hero art with a real Trackspense screenshot / short product loop  [design]
- [x] Change hero CTA to a single "Try Trackspense free"; drop or demote "Learn More"  [frontend]
- [x] Add a product section: 3–4 real screenshots (dashboard, analysis, AI analyst, receipt scan) with benefit captions  [design]
- [ ] Add a privacy/trust block that substantiates "privacy-first" (where data lives, not sold, export/delete)  [content]
- [x] Collapse "coming soon" app cards + public roadmap into one understated "what's next" line  [content] — *verified 2026-07-04: the current HomePage.tsx has no "coming soon" cards or roadmap content at all (confirmed via full-text search), so there was nothing left to collapse*
- [x] Move "Share Your Idea" off the umbrella homepage (into the app or a secondary page)  [frontend]
- [x] Build a proper footer (Privacy, Terms, Contact, social)  [frontend]

---

## Priority 5 — Scope bank sync + hold the brand-expansion narrative  🟢 roadmap

- [ ] Evaluate aggregators (Plaid or similar): coverage, pricing, compliance, effort  [product/eng]
- [ ] Scope automatic transaction import + smart auto-categorization  [eng]
- [ ] Define an explicit "Trackspense has traction" bar (e.g. weekly-retained user count) that unlocks app #2  [founder]
- [ ] Keep CerebroOS as a light frame; do NOT foreground unbuilt apps until traction bar is met  [founder]
- [ ] Quietly build the shared-account + design-token spine in parallel (cheap now, costly to retrofit)  [eng]

---
