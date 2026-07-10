# TS-GRP-145: Idle-session full logout

## Source
`docs/design/Live_QA_Findings_and_Plan.md` §2, §4 item 6.

## Description
Reproduced once: after an extended idle period, navigating within the app cleared both `vs_token` and
`vs_refresh` entirely and forced a redirect to `/login` — a full logout, not the expected silent
refresh. Could not reproduce after a short idle period.

## Investigation — root cause found, not a "couldn't reproduce" situation

`api/api.ts`'s `fetchWithAuth` (the shared fetch wrapper used by every API call in the web app) handles
`401` like this:

```ts
if (response.status === 401) {
  localStorage.removeItem('vs_token');
  localStorage.removeItem('vs_refresh');
  localStorage.removeItem('vs_user');
  window.location.href = '/login';
  throw new Error('Session expired');
}
```

There is **no silent-refresh attempt at all** — any 401 immediately clears both tokens and hard-redirects.
`vs_refresh` is stored on login but is otherwise only read in one place, `App.tsx`'s `handleLogout`,
where it's sent to the backend's session-invalidation endpoint on an **explicit, user-initiated**
logout — never to obtain a new access token.

A `refresh()` client function already exists (`api/auth.ts:110`, calls `POST /api/v1/auth/refresh`,
returns a fresh `access_token`/`refresh_token` pair) but a repo-wide search for its call sites found
**none** — it's dead code, never invoked anywhere.

This fully explains the reproduced symptom without needing idle-duration-specific logic: access tokens
have a limited lifetime; a short idle gap followed by navigation rarely outlives it, but a long one
does, and the very next API call 401s straight into this unconditional hard-logout path. It isn't
"tied to idle duration" as a distinct behavior — it's simply the deterministic result of the access
token having expired by the time of the next request, which idle time makes far more likely to
observe.

**Reference implementation already exists and works correctly** — mobile's `apiFetch.ts`:
1. On 401, calls `attemptRefresh()` (single-flight guarded, so concurrent 401s don't fire duplicate
   refresh requests), which exchanges the stored refresh token via the same `refresh()`-equivalent
   client call and persists the new tokens.
2. Retries the original request once with the new access token.
3. Only force-logs-out if the refresh itself fails (or there was no refresh token to begin with).

## Fix
Port mobile's pattern into `api/api.ts`'s `fetchWithAuth`:
- On 401: read `vs_refresh` from localStorage; if present, call the existing `refresh()` from
  `api/auth.ts`; on success, persist the new `vs_token`/`vs_refresh` and retry the original request once
  with the new token; on failure (or no stored refresh token), *then* clear all three keys and redirect
  to `/login` (today's existing behavior, now as the fallback path instead of the only path).
- Guard against concurrent 401s triggering multiple simultaneous refresh calls (module-level in-flight
  promise, same as mobile's `_isRefreshing`/`_refreshPromise`).

## Files touched
- `varavu_selavu_ui/src/api/api.ts`

## Acceptance criteria
- A request that 401s with a valid, unexpired refresh token transparently retries and succeeds — no
  redirect, no visible interruption.
- A request that 401s with an invalid/expired refresh token (or none stored) still falls back to
  today's clear-and-redirect behavior.
- Concurrent requests that all 401 around the same time trigger exactly one refresh call, not one per
  request.
- `npx tsc --noEmit` clean; existing tests pass.

## Implementation notes (post-build)

Ported mobile's `apiFetch.ts` pattern almost exactly: a module-level `refreshPromise` singleton so
concurrent 401s share one in-flight refresh instead of each firing their own; on success, persist the
new `vs_token`/`vs_refresh` and retry the original request once; on failure (or no stored refresh
token), fall through to the original clear-and-redirect behavior.

**Verified live, both branches:**
- Corrupted `vs_token` only (kept a valid `vs_refresh`), reloaded the Dashboard — page loaded real data
  with zero visible interruption, no redirect. Inspected localStorage afterward: both `vs_token` and
  `vs_refresh` had rotated to brand-new values, confirming the refresh-and-retry path actually fired
  rather than the app happening to already have a valid token some other way.
- Corrupted *both* `vs_token` and `vs_refresh`, reloaded — correctly fell back to clearing all three
  keys and redirecting to `/login`, confirming the fallback path wasn't broken by this change.

`npx tsc --noEmit` clean; existing suite unaffected (no `api/` unit tests exist in this codebase to
begin with — verification rested on the live before/after localStorage inspection above).
