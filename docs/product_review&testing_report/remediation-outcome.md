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

   **Hit in prod (2026-08-11):** they weren't same-site (`expense.cerebroos.com`
   vs the backend's raw `*.run.app` URL), and `Lax` wouldn't have been enough
   either — the SPA's calls are background `fetch()`, not top-level
   navigations, which `Lax` also blocks cross-site. Symptom: login succeeded,
   every following request 401'd (including the refresh retry), client bounced
   back to `/login`. Interim fix: `AUTH_COOKIE_SAMESITE=none` env var on the
   backend Cloud Run service — no redeploy needed, took effect immediately.

   **Resolved (2026-08-14):** interim fix also turned out to be insufficient for
   Safari/WebKit specifically — Intelligent Tracking Prevention blocks
   cross-site cookie storage outright, independent of `SameSite`, so every
   WebKit-based browser (desktop Safari, mobile Safari, and Chrome-for-iOS,
   since Apple mandates WebKit for all iOS browsers) still couldn't log in even
   with `SameSite=None`. Fixed properly via
   [TS-SEC-101](TS-SEC-101-same-origin-auth-cookies.md): a `trackspense-api.cerebroos.com`
   Cloud Run domain mapping puts frontend and backend on the same site (not
   full path-based same-origin routing — same-site is all `SameSite`/ITP
   actually require, see the ticket for why the larger load-balancer approach
   wasn't worth it). `AUTH_COOKIE_SAMESITE` is back to `strict`. Verified on
   desktop Safari and mobile Safari.
4. Existing sessions migrate on next load. Watch for a spike in
   `POST /auth/session` followed by it falling to zero, then delete the endpoint.

## Follow-ups

| Ticket | Title | Status |
|:---|:---|:---|
| [TS-SEC-101](TS-SEC-101-same-origin-auth-cookies.md) | Same-site auth cookies (retire `AUTH_COOKIE_SAMESITE=none`) | ✅ Done (2026-08-14) |
| — | [DB-backed refresh-token revocation](#known-gap--refresh-token-revocation-doesnt-scale-past-one-instance) | 🚧 Implemented, not yet deployed (2026-08-14) |

## Known gap — refresh-token revocation doesn't scale past one instance

**Implemented and tested, not yet deployed (2026-08-14).** ⚠️ The code below is complete and passing (32/32 in `test_auth_cookies.py`, full suite 414 passed/4 skipped) but is still sitting uncommitted in the working tree — Cloud Build only deploys what's on `main`, so **production is still running the in-memory set described under "The original finding" below** until this is committed and pushed. Don't treat this section as describing live prod behavior until that lands; check `git log` on `auth/service.py` or `INFRASTRUCTURE.md` §10 for current deploy status.

Moved to a `refresh_tokens` table in Postgres (migration `b2c3d4e5f6a7`), keyed by `jti` with a `family_id` linking every token descended from one login. `AuthService.rotate_refresh_token` now does RFC 9700-style cascading revocation — reuse of an already-rotated token revokes the *entire family*, not just the reused token (verified: a second, never-itself-reused token from the same family is confirmed dead too, `test_reuse_outside_grace_period_revokes_the_whole_family_not_just_the_reused_token`) — closing the "reuse detection doesn't fire across instances" and "logout doesn't revoke a second tab" gaps below. Also added a 1-minute grace period on reuse (`GRACE_PERIOD`) so a legitimate concurrent-tab/device refresh race isn't treated as theft; a token revoked by explicit logout or an already-caught reuse is exempt from that leniency (`revoked_reason`, checked family-wide via `_family_hard_killed`, not just on the presented row) and stays dead immediately. Rollout was zero-downtime: an in-flight, not-yet-rotated refresh token is unaffected by switching where revocation state lives, since it was never revoked in either the old set or the new (empty) table.

The original finding, for context:

`auth/service.py` tracks spent/revoked refresh tokens in a plain module-level `set()`:

```python
_REVOKED_REFRESH_TOKENS: set[str] = set()
```

Every `/auth/refresh` call checks this set for **reuse detection** (a token already spent must never work again), then adds the presented token to it as part of **rotation** (issuing a fresh pair). `/auth/logout` adds the token too. The design — rotate on every use, detect reuse as a signal of theft — is the right pattern. The problem is entirely about *where* that state lives: in-process memory, not something shared across instances or durable across restarts. The backend runs `min-instances: 1, max-instances: 20` — this gap gets **more** consequential, not less, as traffic grows and Cloud Run actually uses that headroom.

**What breaks for a real user, concretely, as instance count goes up:**

- **Multi-tab / multi-device races → occasional surprise logouts.** Two tabs (or web + a second device) sharing a session can each trigger a refresh around the same moment. If both land on the *same* instance, the second one correctly gets rejected as reuse — expected, if a little abrupt. If they land on *different* instances (increasingly likely as instance count grows with load), the instance that never saw the rotation still thinks the presented token is valid, happily issues a second new pair, and now two "latest" refresh tokens are in flight with only one winning the shared cookie jar. Best case, mildly confusing; worst case, the losing tab's session state ends up inconsistent. This is the one that actually inconveniences legitimate users, and its frequency scales directly with concurrent instance count.
- **Reuse detection silently doesn't fire across instances.** If a stolen refresh token gets used by an attacker and then the real client also tries to use it, whichever one hits an instance that already saw the other's rotation gets correctly blocked — but the one that lands on a *different*, unaware instance sails through. Reuse detection is real, but only reliably enforced per-instance, not per-token-globally. Not a user-facing blocker, but it quietly weakens the actual security property this mechanism exists for.
- **Every deploy/restart wipes all revocation state.** Since our new Cloud Build pipeline (see `INFRASTRUCTURE.md` §6) deploys automatically on every push to `main`, this now happens *more* often than before, not less. A token that was explicitly revoked (rotated away, or a user hit "logout") five minutes before a deploy is, on the fresh instance, indistinguishable from a token that was never revoked at all — it'll be accepted again until it naturally expires (refresh tokens live 7 days). Not a blocker for legitimate users; a real exposure window for anyone whose token was compromised right before a deploy.
- **Unbounded memory growth, low urgency.** Nothing ever prunes this set — nothing removes an entry once a token naturally expires. On a long-lived instance (`min-instances: 1` means one can, in principle, run for a long time between forced recycles) this grows monotonically with every login/refresh/logout it personally handles. Back-of-envelope: at ~250 bytes/token and the 512Mi memory limit, that's on the order of a couple million entries before it's a real problem — plausible only under sustained heavy traffic on an instance that goes an unusually long time without being recycled. Deploys ironically "fix" this by wiping the leak along with the (desired) revocation data. Lowest-urgency item here, but a genuine unbounded-growth structure, worth knowing about.

**None of this was a hard outage-level blocker** — at the traffic level this was found at it mostly would have manifested as the rare double-tab logout. It would have gotten steadily worse, not better, as concurrent users and instance count grew, which is why it was fixed proactively rather than waiting for it to actually hurt. Every failure mode above is eliminated the same way: `_REVOKED_REFRESH_TOKENS` moved out of process memory into shared, durable storage (Postgres, already a dependency — no Redis/Memorystore needed, consistent with how the migration-job fix earlier in this project preferred "use what's already there" over standing up something new). One thing intentionally *not* done: expired-row cleanup is not yet automated (the table will grow indefinitely, just no longer unbounded-per-process — it's bounded by actual token volume, which is a very different risk profile). Worth a periodic `DELETE WHERE expires_at < now()` at some point, not urgent.
