# TrackSpense — Pre-Launch Remediation Brief (for Claude Code)

You are working on **TrackSpense**, a personal + shared-expense fintech app.
- **Frontend:** React SPA (Material UI), served at `https://expense.cerebroos.com`, bundle `main.*.js`.
- **Backend:** FastAPI (Pydantic v2) on Google Cloud Run, base URL `/api/v1`, JWT (HS256) bearer auth. Internal project name `varavu-selavu`.
- **Auth today:** `vs_token` (access) and `vs_refresh` (refresh) JWTs plus `vs_user` (email) are stored in **`localStorage`**. JWT `sub` = user email. Access token ~7-day-ish life, refresh longer.

A pre-launch security/QA/product audit was completed against the live app. Your job is to fix the findings below. Work through them in the numbered order (P0 → P2). For each item: implement the fix on **both** frontend and backend where relevant, add/extend automated tests, and update any docs. Do **not** weaken the existing, correct behaviors noted under "Do not regress."

---

## Context: what is already correct (do NOT regress)

These were verified working and must keep working:
- API returns **401** for missing/invalid token; `alg:none` forged tokens are rejected.
- Group authorization: non-members get **403 "Not a member of this group"** on `/api/v1/groups/{id}/...`.
- Server derives identity from the JWT — client-supplied `?user_id=` overrides on `/expenses` and `/analysis` are correctly **ignored**.
- Deleting a group with outstanding balances returns **409** and requires `?force=true`.
- Logged-out navigation to `/dashboard` redirects to `/login`.
- Adding an expense updates the dashboard reactively (no refresh).
- Split types Equal/Exact/Percentage/Shares/Adjustment, Simplify Debts, per-group CSV export, recurring, placeholder members, multi-currency, soft-delete (`deleted_at`).

Add regression tests that lock in each of the above so the changes below don't break them.

---

## P0-1 — Move JWTs out of `localStorage` and sanitize all user text

**Problem.** Access **and** refresh JWTs live in `localStorage`, readable by any JS on the page. Separately, free-text fields are persisted **completely raw** — e.g. saving an expense description of `ZZTEST <b>bold</b> <img src=x onerror=alert(1)>` stored the string verbatim (confirmed via `GET /api/v1/expenses`). Today React auto-escaping prevents execution, but this is a single-layer defense. The combination (token-in-localStorage + unsanitized storage) means any future unescaped sink — email/PDF digests, a mobile webview, CSV opened in a spreadsheet, or the "Ask anything" AI reflecting stored text into an HTML/markdown context — becomes **stored XSS → full account takeover**. This is the top launch risk for a money app.

**Fix — token storage:**
1. Stop storing `vs_token` / `vs_refresh` in `localStorage`. Issue them as cookies with `HttpOnly`, `Secure`, `SameSite=Strict` (or `Lax` if cross-site navigation to the app is required). The refresh token in particular must be `HttpOnly` and ideally scoped to the refresh endpoint path.
2. Move the token refresh flow server-side: a `/api/v1/auth/refresh` endpoint that reads the refresh cookie and rotates tokens (implement refresh-token rotation + reuse detection — invalidate the family on reuse).
3. Because cookies are now used, add **CSRF protection** for state-changing requests (double-submit token or `SameSite=Strict` + custom header check). Verify CORS allows only `https://expense.cerebroos.com` (no wildcard, `Access-Control-Allow-Credentials: true`).
4. Frontend: remove all `localStorage.getItem('vs_token'|'vs_refresh')` reads; rely on cookies being sent automatically (`fetch(..., { credentials: 'include' })`). `vs_user` (email) may remain in a non-sensitive store for display, but prefer fetching profile from an authenticated `/me` endpoint.
5. Shorten access-token lifetime to ~15–30 min; rely on silent refresh.
6. Consider dropping PII from the JWT: use an opaque user id as `sub` instead of the email.

**Fix — input sanitization / output encoding (defense in depth):**
1. On the backend, validate and normalize every free-text field on write: `description`, `merchant_name`, group `name`, member `display_name`, category. Strip or reject control chars; enforce max lengths (e.g. description ≤ 200, name ≤ 100). Store sanitized values.
2. Do **not** rely on the client alone. Add output encoding at every serialization boundary that is not React-escaped: CSV export (prevent CSV/formula injection — prefix cells beginning with `= + - @` with a `'`), any email/PDF/HTML generation, and any payload sent to the AI/LLM layer.
3. Ensure the "Ask anything" / "What changed → Ask why" features never render model output or reflected expense text as raw HTML/markdown without sanitization (e.g. DOMPurify on any `dangerouslySetInnerHTML`, or avoid it entirely).

**Acceptance criteria:**
- No JWT is readable from `document`-accessible `localStorage`/`sessionStorage`.
- Stored `description` for the payload above is sanitized (tags stripped/escaped) in the DB and in every export path.
- CSV export of a description containing `=cmd` is neutralized.
- CSRF token required on POST/PUT/DELETE; requests without it are rejected.
- Regression tests: 401/403/`alg:none`/`user_id`-override behaviors still pass.

---

## P0-2 — Fix the group balance inconsistency (data correctness)

**Problem.** The groups **list** and the group **detail** compute balances differently and disagree. Confirmed on group `RSJ`:
- `GET /api/v1/groups` → `my_balance: 0`, and the UI list label reads **"settled up."**
- Group detail (`GET /api/v1/groups/{id}` + `/balances`) → **YOU OWE $52.86** (Sai −$237.20, Jeevitha +$184.34, net −$52.86 — which is arithmetically correct).

So the list-level `my_balance` is wrong (0) while the detail is right. In a financial product a self-contradicting ledger destroys trust.

**Fix:**
1. Find the two code paths that compute a member's net balance (the list aggregate vs. the detail/`balances` computation). Unify them behind **one** balance function/service used by both endpoints. The detail computation appears correct — make it the single source of truth.
2. Verify the calculation accounts for the `Simplify Debts` setting consistently (a likely cause: the list may be reading a simplified/netted value that zeroes out, while detail sums raw pairwise balances — or vice versa).
3. Fix the UI "settled up" label to derive from the same value; only show "settled up" when the true net is 0.

**Acceptance criteria:**
- For RSJ, the list `my_balance` equals the detail net (−52.86) and the label no longer says "settled up."
- Unit tests covering: simplified vs. non-simplified debts, multi-member, mixed payer/participant, currency, and a genuinely settled group (net 0 → "settled up").
- Property/round-trip test: sum of all members' `net` in a group == 0.

---

## P1-3 — Amount input validation (client + server)

**Problem.** The amount field accepts unbounded values — `999999999999` was accepted and visually overflowed/clipped the input. Negative values are already stripped at input (keep that), but there is no upper bound and zero-handling is unclear.

**Fix:**
1. **Client:** enforce `> 0`, a sane max (e.g. `≤ 1,000,000` per expense — pick a product-appropriate ceiling), max 2 decimal places, and disable Save with an inline error when out of range. Format the display with grouping and ensure the field never overflows its container (truncate/scale font or cap digit count).
2. **Server:** the write endpoints (`POST /api/v1/expenses`, `POST /api/v1/groups/{id}/expenses`) must reject amounts `≤ 0`, above the max, or with invalid precision — return 422 with a clear message. Do not trust the client. (Backend already uses Pydantic — add `Decimal` field constraints: `gt=0`, `le=MAX`, `max_digits`, `decimal_places=2`. Use `Decimal`, not float, for money to avoid the rounding artifacts seen in analysis totals, e.g. `306.49999999999994`.)
3. For group splits, validate that the sum of split shares equals the expense amount (within a cent) before persisting.

**Acceptance criteria:**
- Amount `0`, negative, `> MAX`, and `>2 decimals` are rejected client- and server-side.
- Money math uses `Decimal` end-to-end; analysis category totals no longer show floating-point noise.
- The amount field cannot visually overflow at 12+ digits.

---

## P1-4 — Verify and fix true mobile rendering

**Problem.** The app uses MUI with a responsive drawer, 73 media queries, and ellipsis truncation for long names, but real small-viewport rendering was **not** verifiable in the audit environment.

**Fix / verify:**
1. Manually and via automated viewport tests (e.g. Playwright at 375×812 and 390×844) confirm: dashboard, the "Where it went" bar + category list, the Analysis charts (spend-over-time, category breakdown), the Expenses list, and all modals render without horizontal scroll, clipping, or overlap.
2. Confirm the sidebar collapses to a mobile drawer/hamburger and that touch targets are ≥ 44px.
3. Confirm long category/merchant/group names truncate with tooltip access rather than pushing layout.

**Acceptance criteria:**
- Playwright responsive snapshots at 2+ phone sizes with zero horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`).
- No control smaller than 44px in the primary flows.

---

## P2-5 — Product gaps (schedule post-launch; implement if quick)

Lower priority, not launch blockers, but users will ask:
1. **Personal-level export.** CSV export exists only per-group. Add "Export all my expenses" (CSV, and ideally PDF) from the Expenses/Analysis page for the personal ledger. Apply the same CSV-injection guard from P0-1.
2. **Budgets / spending limits** per category or month, with progress against the "Where it went" view.
3. **Settle-up completion.** Venmo/PayPal/UPI handles are stored on members but there's no in-app confirmation that a settlement occurred. At minimum, add a "Mark as settled" action that records a settlement transaction and updates balances (verify it interacts correctly with the P0-2 balance engine and the 409 delete guard).

---

## Cross-cutting requirements

- **Tests:** every P0/P1 item ships with automated tests (backend: pytest; frontend: component + Playwright). Add the "do not regress" list as an explicit test suite.
- **Rate limiting:** add rate limits on `/auth/login`, `/auth/refresh`, and account-creation endpoints (not tested in the audit; assume absent). Ensure generic error messages to avoid user enumeration.
- **Secrets:** confirm the HS256 signing secret is strong, stored in Secret Manager, and rotatable; consider moving to RS256/asymmetric so the frontend/other services can verify without the signing key.
- **Migration/rollout:** the token-storage change (P0-1) invalidates existing `localStorage` sessions — plan a graceful migration (on next load, if only `localStorage` tokens exist, exchange them once for cookies via a one-time endpoint, then clear `localStorage`).
- **Definition of done:** all P0 and P1 acceptance criteria met, "do not regress" suite green, and a short PR description per item mapping to this brief.

---

### Quick reference — endpoints touched
- `POST /api/v1/auth/login`, new `POST /api/v1/auth/refresh`, `/me`
- `GET/POST /api/v1/expenses`, `DELETE /api/v1/expenses/{row_id}`
- `GET /api/v1/groups`, `GET /api/v1/groups/{id}`, `/balances`, `POST /api/v1/groups/{id}/expenses`, `POST /api/v1/groups/{id}/members`, `DELETE /api/v1/groups/{id}?force=`
- `GET /api/v1/analysis`, `GET /api/v1/analytics/changes`, `GET /api/v1/config`

Group-expense write schema (for reference): `{ description, amount, category, date, currency, split_type, payers:[{member_id, amount_paid}], split:{ type, ... } }`.
