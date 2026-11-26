# Requirement agreement — TS-SEC-101

Status: agreed 2026-11-25 (owner request + plan approval in conversation). Owner: Rajeshkumar Ganesan. AC text is canonical in work-item.json.

## Problem and users
Found while porting the shell to `cerebroos-mobile-app-template`; confirmed by reading TrackSpense mobile code. Anyone sharing a device between accounts, or whose session is force-ended (401), is exposed:
1. **HIGH** `core/navigation/CoreApp.tsx` holds one module-level `QueryClient` that is never cleared. Many keys carry no user (`['profile']`, `['cards-mine']`, `['groups']`, `['budgets', …]`, `['activity-feed', …]`) and `staleTime` is 5 minutes, so the next account can see the previous account's cached data; a mutation still in flight at sign-out writes old data back afterwards.
2. **MEDIUM** `core/auth/SecurityScreen.tsx` writes the re-issued access and refresh tokens whenever `changePassword` resolves, even after sign-out or after another user signed in, restoring a signed-out account's tokens.
3. **LOW** `ProfileScreen` (`exportData`, `downloadAll`) and `GroupSettingsSheet` (`handleExport`) open the share sheet with a late result after sign-out, showing the old account's data.

## Outcome and scope
Included: one `QueryClient` per signed-in session, replaced on explicit and forced sign-out (template approach: `SessionQueryProvider`); a shared session guard in `core/auth` (epoch advanced on sign-in, explicit sign-out and forced sign-out; token refresh does not advance it) with a serialised token-write queue; guarded password-change token write; late exports and the group invite share dropped when the session changed; `apiFetch` refresh token write routed through the same queue; native E2E account-switch extension; review of other module-level caches.

Added scope (owner, 2026-11-25 "Fix those P1 and P2 findings", after the first review pass): (4) the web app has the same bug as mobile bug 1 (module-level `QueryClient` in `App.tsx`, never cleared): one query client per signed-in account on web; (5) AI consent survives a forced sign-out, so the next account is not asked: store consent per account; (6) a push token stays registered to the previous account after a forced sign-out: registering takes the device over server-side.

Excluded: renaming SecureStore keys; changing the rule that a forced sign-out skips sign-out cleanups (consent is made per-account instead, so the rule stays intact); any backend change; editing the template repo; commits and pushes.

## Decisions and open questions
- Branch: build on `mobile-app-analytics` together with TS-GA4-002 (owner, 2026-11-25); changes stay uncommitted.
- Approved defaults (owner, "Go with this"): route the `apiFetch` refresh write through the queue; guard the group invite share; write the E2E extension and record it as not run when no simulator/Maestro is available; report, not fix, the `aiConsent` forced-sign-out gap.
- Template (follows TrackSpense-first for core) takes back the exact core files at the end.
- S-1/S-2/S-3 design (owner asked to fix them; decisions taken by the engineer, reviewable): web `context/SessionQueryProvider` driven by the stored `vs_user` identity, replaced on logout, forced logout and account switch; AI consent value `granted:<email>` (an older build's bare `granted` is asked again once; a prompt left open by a previous account cannot consent the next); `NotificationService.register_device` deletes other users' rows for the same Expo token (no migration). Not done: a client-side unregister on forced sign-out (the token is already invalid), so a device whose next user never registers push (permission denied) keeps the previous account's row until then.
