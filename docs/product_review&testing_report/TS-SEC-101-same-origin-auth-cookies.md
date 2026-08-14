# TS-SEC-101 — Put the API on the same site as the frontend (retire `SameSite=None`)

**Status:** ✅ Done (2026-08-14) — `AUTH_COOKIE_SAMESITE=strict` live in prod; verified working on desktop Safari and mobile Safari (the two browsers that were failing).
**Priority:** P1 → **elevated**: confirmed this isn't just a CSRF defense-in-depth gap, it's a full login failure for every WebKit-based browser (desktop Safari, mobile Safari, and Chrome-for-iOS — Apple mandates WebKit for all iOS browsers, so "Chrome" on an iPhone is WebKit underneath). `SameSite=None` only ever helped Chromium; Safari's ITP blocks cross-site cookie storage unconditionally, independent of `SameSite`.
**Depends on:** none
**Related:** [remediation-outcome.md](remediation-outcome.md) §"Before deploying" item 3 (flagged this exact risk pre-launch; the flag was missed, not wrong); [INFRASTRUCTURE.md](../INFRASTRUCTURE.md) §4 for the live DNS/domain-mapping setup

---

## Background

Prod currently runs frontend and backend as genuinely different **sites** (browser cookie terms, i.e. different eTLD+1):

- Frontend: `https://expense.cerebroos.com` (site `cerebroos.com`)
- Backend: `https://varavu-selavu-backend-952416556244.us-central1.run.app` (site `run.app`)

`AUTH_COOKIE_SAMESITE` defaulted to `strict` (per `core/config.py`). `Strict` — and `Lax` — cookies are never attached to cross-site `fetch()`/XHR calls, only to same-site requests (or, for `Lax`, top-level navigations). Because the two services are cross-site, every authenticated call *after* login arrived at the backend with no auth cookie at all: login itself succeeded (`200`, cookies get set), the very next request 401'd, the silent-refresh retry 401'd too (the refresh cookie has the same problem), and the client correctly treated that as a dead session and bounced to `/login`. No exception anywhere — it was a normal `401`, just against a request that never carried the cookie.

**Interim fix already shipped:** `AUTH_COOKIE_SAMESITE=none` is set as an env var on the `varavu-selavu-backend` Cloud Run service (2026-08-11). `AUTH_COOKIE_SECURE` was already `true` by default, which `SameSite=None` requires, so this took effect immediately with no code deploy. Login works in prod as of this change.

## Why this is tracked as a follow-up, not closed

`SameSite=None` removes one of two independent CSRF defenses this app has:

- **Still intact:** the double-submit CSRF token (`core/csrf.py`) — the `vs_csrf` cookie is deliberately JS-readable only by same-origin code, echoed in `X-CSRF-Token`, and checked server-side on every state-changing request. A cross-site attacker can get the browser to attach cookies (thanks to `None`), but cannot read `vs_csrf` to forge a matching header, so state-changing forgeries still 403.
- **Still intact:** `CORS_ALLOW_ORIGINS` is an explicit allowlist, not a wildcard — a malicious page can trigger a "blind" authenticated `GET` (the CSRF middleware exempts safe methods by design) but cannot read the response cross-origin.
- **What's actually gone:** the browser's own automatic "don't even attempt cross-site" backstop. We're now relying entirely on the two mitigations above holding correctly, everywhere, forever, rather than having the browser refuse the attempt in the first place. That's a real reduction in defense-in-depth, even though the practically exploitable paths are currently covered.

This is an acceptable interim posture, not a permanent one — the fix is architectural.

## Proposed solution (chosen: subdomain split — `trackspense-api.cerebroos.com`)

Originally scoped as path-based routing (`expense.cerebroos.com/api/*` via a Cloud Load Balancer + Serverless NEGs, true same-*origin*, no CORS needed at all). Revisited once the Safari/ITP finding (above) changed the actual requirement: ITP's blocking boundary — like `SameSite`'s — is **site**, not **origin**. A subdomain of the same registrable domain is sufficient to satisfy both; the extra step from same-site to same-origin (dropping CORS entirely) doesn't fix anything ITP-related that a subdomain doesn't already fix, so it wasn't worth the added infrastructure (a load balancer, URL map, and NEGs for both services) for what's now a much smaller marginal benefit.

**Mechanism (implemented):** a native GCP Cloud Run **domain mapping** for `trackspense-api.cerebroos.com` → `varavu-selavu-backend`, DNS-only in Cloudflare (must not be proxied — Google's managed-cert issuance needs to see the real `CNAME → ghs.googlehosted.com` record directly). Named `trackspense-api` rather than the initially-used `api` — this GCP project/domain hosts other unrelated apps, and a bare `api.cerebroos.com` would misleadingly imply it's the API for the whole domain rather than just this product. See [INFRASTRUCTURE.md](../INFRASTRUCTURE.md) §4 for the full DNS/mapping mechanics and why it has to stay DNS-only.

**Progress — all done:**
1. ✅ Domain mapping created, DNS added in Cloudflare (grey-cloud/DNS-only), cert provisioned, verified live (`curl https://trackspense-api.cerebroos.com/api/v1/config` → `200`).
2. ✅ Frontend's `REACT_APP_API_BASE_URL` (`varavu_selavu_ui/.env.production`) now points at `https://trackspense-api.cerebroos.com` instead of the raw `*.run.app` URL; deployed and confirmed in the served bundle (zero remaining references to the old `*.run.app` URL).
3. ✅ `AUTH_COOKIE_SAMESITE` flipped back to `strict` on the backend Cloud Run service.
4. ✅ Verified on desktop Safari and mobile Safari — both log in and save cleanly, no bounce, no 401/403. (Chrome-for-iOS not separately re-tested, but it shares Safari's WebKit engine and the identical failure mode this fixes, so treated as covered.)
5. ✅ `remediation-outcome.md`'s "Before deploying" §3 updated to point here instead of standing as an open warning.

`CORS_ALLOW_ORIGINS` is unchanged and stays required — `expense.cerebroos.com` and `trackspense-api.cerebroos.com` are same-site but still different origins, so CORS (not SameSite/ITP) is what governs whether the browser lets the frontend's JS read the response at all. That's the one thing path-based routing would have removed that this doesn't; not worth the extra infrastructure for it alone.

**Rejected alternative:** path-based routing (`expense.cerebroos.com/api/*` via a Cloud Load Balancer + Serverless NEGs) — see above for why. Worth reconsidering later only if there's a *separate* reason to want true same-origin (e.g. wanting to drop CORS as a maintained surface entirely), not as a fix for anything currently broken.

## Out of scope

- Mobile app — uses `Authorization: Bearer` with SecureStore, never touches cookies, unaffected by any part of this.
- DB-backed refresh-token revocation (separate known gap, already tracked in `remediation-outcome.md`'s P0-1 section — in-memory revocation set doesn't survive a restart or span Cloud Run instances).
