## 3. Productionizing Trackspense (Web App)

I went through the live web app screen by screen. Overall it is **more complete than a prototype but not yet production-ready** — the feature breadth is real; the polish, hardening, and reliability are not there yet.

### Feature-by-feature findings

**Dashboard** — Strong. Three summary tiles (Total Expenses, This Month, This Week), two donut charts (Other Expenses this month; Recurring this month), a 12-month spend-trend line chart, a "Discover Insights" panel (top purchased items, top merchants), a recent-transactions table, an "Upcoming Recurring (next 14 days)" panel, and a Quick-Add-Expense form. There's even a "Customize Layout" control. This is a genuinely good dashboard for the category.

**Expenses** — Solid. A clean table (Date, Description, Merchant, Category, Cost) with inline edit and delete per row, and an "Add Expense" modal. The modal is the standout: it captures description, an auto-suggested merchant/store name derived from the description, date, cost, a "Repeat monthly" toggle, main/subcategory, **and receipt upload with a "Parse Receipt" (OCR) option.** Receipt parsing is a real, differentiating feature — many budget apps don't have it.

**Analysis** — Good and unusually thoughtful. Year/month filters, an "Overall Year" toggle, a Summary (expenses vs. income), a "What Changed" panel that surfaces notable shifts ("Spend decreased at Costco −57%," "Price increase for Ranjani Tello mobile recharge +131%"), a Top Categories bar chart, and a "% of Income Spent by Category" breakdown. The "What Changed" and "% of income" framings are above the category baseline.

**Item Insights / Merchant Insights** — Nice-to-have depth. Top purchased items and top merchants ranked by spend, with year/month filters. This item-level granularity is more than most competitors expose.

**Recurring** — Functional and real. An "Add Template" form (description, category, day of month, default cost, start date, active toggle) and a table with status (Active/Paused), last-processed date, and per-row actions (edit, run-now, delete). This is a proper recurring-transactions engine, not a stub.

**AI Analyst** — Present but **currently broken in production.** It exposes a provider selector (OpenAI) and a model selector (gpt-5-mini) with suggested prompts. When I asked "What were my top spending categories?" it returned: *"Failed to generate response: Error code: 429 — You exceeded your current quota, please check your plan and billing details … 'code': 'insufficient_quota'."* The OpenAI account behind it is out of credits, so the flagship AI feature fails for users right now. Exposing the raw provider/model and the raw upstream error to end users is also not production behavior.

**Profile / Account** — Basic but complete. Email, name, phone, address, save, logout, and a "Danger Zone" hard-delete account ("cannot be undone"). Good that delete exists (needed for app-store compliance); it should have a confirmation step and a clear data-deletion guarantee.

**Budgets** — **Missing/broken.** The `/budgets` route renders a blank page. Budgeting is named as a core capability of the app and the brand, but there is no working budgets screen. This is the single biggest functional gap.

### Prototype-quality vs. production-ready assessment

Concrete technical observations from the network layer and behavior:

- **Auth / data security — needs review.** API calls identify the user by passing the **email address as a query-string parameter** (e.g., `/api/v1/analysis?user_id=rajeskumarcse@gmail.com`). Two problems: (1) if the backend trusts that parameter instead of deriving the user from a verified session token, it's an Insecure Direct Object Reference — anyone could read another user's data by changing the email; (2) putting an email/PII in URLs leaks it into server logs, analytics, and browser history. This must be verified and, if unfixed, is a hard launch blocker.
- **Error handling — prototype-grade.** The AI feature surfaces the raw upstream 429/JSON error to the user. There's no graceful fallback or friendly message. Assume other failure paths are similarly raw.
- **The AI feature itself is down** due to an exhausted OpenAI quota — a billing/ops gap, not just code.
- **Hosting/infra — reasonable foundation.** Backend runs on Google Cloud Run (`varavu-selavu-backend`, us-central1) with Cloudflare in front and a PWA manifest present. That's a sane, scalable base. Note the internal service name ("varavu selavu") leaks in network calls — cosmetic, but worth renaming before it's public-facing.
- **Analytics — present** (GA4 installed), which is good, though you'll want product-analytics events, not just page views.
- **Empty/edge states — unverified and likely thin.** The account is populated with data, so I couldn't see zero-state screens. New users will land on empty dashboards and charts; these need designed empty states or the first-run experience will feel broken.

### Prioritized checklist to public launch

**P0 — blockers (do before any public launch):**

- Verify server-side auth: confirm the backend derives the user from a validated session token and **ignores** the `user_id` query param; fix if not. Stop passing email/PII in URLs.
- Fix or gracefully disable the AI Analyst — resolve the OpenAI billing/quota and stop showing raw provider errors; move the API key server-side (never expose provider/keys client-side).
- Ship a working Budgets screen, or remove Budgets from all messaging until it exists. Don't advertise a feature that renders blank.
- Add friendly error handling and loading/failure states across the app.
- Publish a Privacy Policy and Terms (also required for mobile).

**P1 — needed for a credible launch:**

- Design and test empty/first-run states for every screen (dashboard, charts, insights, recurring).
- Add a confirmation + clear data-deletion guarantee to account delete.
- Add basic input validation and duplicate/edge handling in expense and recurring forms.
- Rate-limit and cost-cap the AI feature so a single user can't exhaust quota.
- Rename the internal backend service and scrub internal names from public responses.

**P2 — polish:**

- Product analytics events (activation, retention funnels), not just page views.
- Performance pass (chart rendering, large transaction lists, pagination).
- Accessibility and mobile-web responsiveness check.

### Recommended next steps

- Audit the `user_id`-in-URL auth path immediately; treat as a security blocker until proven safe.
- Either finish Budgets or pull it from the product surface this week.
- Take the AI key server-side, add quota caps, and replace raw errors with friendly fallbacks.
- Draft Privacy Policy and Terms now (shared with the mobile launch).

---