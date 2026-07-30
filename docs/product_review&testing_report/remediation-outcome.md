# Pre-Launch Remediation — Outcome

Maps each item in [trackspense-remediation-prompt.md](trackspense-remediation-prompt.md)
to what shipped. One commit per item on `prelaunch-remediation`.

| Item | Status | Commit |
|:---|:---|:---|
| P0-1 token storage + sanitization | Done | `fix(security): …` + `feat(auth): …` |
| P0-2 balance inconsistency | Done | `fix(groups): make list and detail balances agree` |
| P1-3 amount validation | Done | `fix(security): …` (+ QuickCapture in `test(mobile): …`) |
| P1-4 mobile rendering | Done | `test(mobile): add responsive suite …` |
| P2-5 product gaps | 2 of 3; budgets deferred | `feat(export): …` |

Tests: **392 backend** (pytest) + **94 frontend** (Jest) + **41 responsive**
(Playwright, 2 viewports). One pre-existing Jest suite (`DashboardPage.test.tsx`)
still fails to load for an unrelated reason — `heic2any` needs a `Worker` that
jsdom lacks — and fails identically on a clean checkout.

---

## P0-1 — Tokens out of localStorage, text sanitized

**Verified in a browser against the running app:** after login, `document.cookie`
exposes only `vs_csrf` and `localStorage` holds only `vs_user`. No JWT is
reachable from page JavaScript, and authenticated API calls succeed on cookies
alone.

Token storage:
- `vs_token` (HttpOnly, `Path=/`, ~30 min) and `vs_refresh` (HttpOnly,
  `Path=/api/v1/auth`, 7 days), both Secure + SameSite=Strict. Strict is safe
  because the Google flow POSTs an id_token rather than relying on a redirect.
- `/auth/refresh` reads the cookie (or a body token, for native clients), spends
  the presented token and issues a fresh pair. Replay is rejected.
- Double-submit CSRF middleware on state-changing methods, enforced only when the
  request carries the auth cookie. Registered before CORS so it runs after it and
  rejections still carry CORS headers.
- CORS confirmed: allow-list only, `Access-Control-Allow-Credentials: true`, no
  wildcard; a disallowed origin gets no `Access-Control-Allow-Origin`.
- Access-token lifetime was already 30 min, within the brief's 15–30 window.

Sanitization / output encoding:
- `core/text_sanitize.py` normalizes description, merchant, group name, member
  display name, category and notes on write: NFKC, control + zero-width +
  bidi-override characters stripped, tag-like sequences removed, whitespace
  collapsed, length ceilings enforced (→ 422). Tags are *stripped*, not escaped,
  so values don't render as literal `&lt;b&gt;` after React escapes them again.
- `core/csv_safety.py` prefixes cells starting `= + - @ TAB CR` with an
  apostrophe, applied to both the group and personal exports. Numeric cells are
  left numeric.
- The contact/feedback **HTML email** interpolated every field raw; all are now
  `html.escape`d at the sink.
- `AIAnalystChat` renders model output through `dangerouslySetInnerHTML` via a
  hand-rolled markdown converter that never escaped its input. It now escapes
  first, then substitutes, leaving no bypass surface.

### Deviations from the brief

- **Opaque `sub` instead of email** — not done. The brief lists it as "consider";
  `sub` is load-bearing across ~40 call sites (`auth_required` returns the email
  and services query by `user_email`), so it is a data-model change, not an auth
  tweak.
- **RS256** — not done, also "consider". `assert_signing_secret_is_safe` now
  refuses to boot outside `local` on a placeholder or <32-char `JWT_SECRET`,
  which closes the immediate risk: the default is the public literal
  `change-me`, and nothing previously stopped a deployment starting with it.
- **DB-backed refresh-token families** — deferred by decision. Revocation is
  still the pre-existing in-memory set, so it **does not survive a restart or
  span Cloud Run instances**. Rotation and reuse detection are correct
  single-instance. This is the main known gap.

## P0-2 — Balance inconsistency

`GroupService._group_summary` hardcoded `my_balance: 0.0` and never consulted
`BalanceService`, so the list said "settled up" where the detail correctly showed
a non-zero net. `list_groups_for_user` was discarding the joined `GroupMember`
row it already had. Both now go through `BalanceService.member_net`.

`simplify_debts` was confirmed orthogonal: it selects which transfer list to
suggest, never a member's net.

The frontend derivation moved into `utils/balance.ts` with a half-cent epsilon,
so float noise no longer renders as "you owe $0.00".

## P1-3 — Amount validation

Money is constrained `Decimal`, not `float`: `gt=0` (or `ge=0` where zero is
legitimate), `<= 1,000,000`, at most 2 decimal places → 422. The untyped
`header` dict on `/expenses/with_items` bypassed all of it and is now validated
explicitly. Analysis totals are rounded at the aggregation boundary, fixing the
`306.49999999999994` artifact.

`QuickCaptureSheet` turned out to be a **second** amount-entry path the first
pass missed — its keypad capped at 7 digits (~9,999,999) and its desktop text
input had no bound at all, so both could compose an amount the API now rejects.
Both share `sanitizeAmountInput`.

Two existing tests deliberately changed: a zero settlement amount and a
zero-amount items update now fail at the schema with 422 rather than 400 in the
handler, which the brief specifies.

## P1-4 — Mobile rendering

Verified at 375×812 and 390×844, then automated (`varavu_selavu_ui/e2e/`).
Dashboard, expenses, analysis, groups and the quick-capture sheet all show zero
horizontal overflow; the desktop rail is hidden and `BottomNav` is the mobile
navigation; no ellipsised name widens the layout.

Three controls were genuinely under 44px and were fixed: the header's Ask AI and
theme-toggle icon buttons (42px, fixed via a `MuiIconButton` theme floor), the
UserMenu avatar, and `TypeToLogBar`'s input.

Two assertions are easy to get wrong, and both were written wrong first:
- Per-element overflow checks yield false positives — the `AmbientBackground`
  blobs are deliberately oversized and clipped by an `overflow-x: hidden`
  parent. The real signal is `documentElement.scrollWidth <= innerWidth`.
- Measuring `getBoundingClientRect` also yields false positives — `SegmentedTabs`
  keeps a compact 22–32px pill but expands its tap area to 44×44 with an
  invisible `::after`, which legitimately passes. The suite hit-tests with
  `elementFromPoint` instead.

`auth.setup.ts` logs in once and shares the cookie jar via `storageState`. That
is required, not just faster: `/auth/login` is rate-limited to 5/minute, so
logging in per test starts returning 429 partway through a run.

## P2-5 — Product gaps

1. **Personal CSV export** — done. `GET /api/v1/expenses/export.csv` with
   optional MM/DD/YYYY bounds, behind the same injection guard, plus an
   "Export CSV" button on the Expenses page. PDF was not attempted (the brief
   says "ideally").
2. **Budgets** — deferred; needs a table, migration, CRUD and UI. Note
   `BudgetVsActualCard.tsx` is currently dead code reading a `vs_budgets`
   localStorage key nothing writes.
3. **Mark as settled** — already existed (record / list / undo + `SettleUpDialog`).
   Rather than rebuild it, tests now cover the interactions the brief asked about:
   settling zeroes the balance in *both* endpoints, an outstanding balance still
   409s on delete while a settled group deletes without `force`, and undo
   restores the balance.

## Cross-cutting

- **Rate limiting** — added to `/auth/refresh`, `/register`, `/google` and
  `/forgot-password`; `/login` already had 5/minute. `/register` and
  `/forgot-password` no longer reveal whether an email exists.
- **Secrets** — `assert_signing_secret_is_safe` fails startup outside `local` on
  a placeholder or short `JWT_SECRET`. Confirm Secret Manager injects a strong
  value; rotation still invalidates all live sessions, since there is no `kid`
  and no second accepted key.
- **Migration/rollout** — `POST /api/v1/auth/session` exchanges a lingering
  localStorage refresh token for cookies once, then the client erases it, so the
  rollout doesn't log everyone out. **Remove this endpoint** once refresh
  lifetimes (7 days) guarantee no legacy sessions remain.
- **Test isolation** — two `conftest.py` fixtures were added for pre-existing
  cross-test leakage the new tests exposed: the process-global analysis cache and
  the rate-limit counters both outlived the per-test database. Related: the
  `/analysis` route hardcodes `use_cache=True`, so the `?use_cache=false` some
  tests pass has always been a silent no-op.

## Before deploying

1. Set a strong `JWT_SECRET` from Secret Manager — startup now fails without one
   outside `local`.
2. Keep `AUTH_COOKIE_SECURE=true` in every deployed environment (it is the
   default; only local http development turns it off).
3. Confirm the API and app are same-site, or switch `AUTH_COOKIE_SAMESITE` to
   `lax` — Strict cookies are not sent cross-site.
4. Existing sessions migrate on next load. Watch for a spike in
   `POST /auth/session` followed by it falling to zero, then delete the endpoint.
