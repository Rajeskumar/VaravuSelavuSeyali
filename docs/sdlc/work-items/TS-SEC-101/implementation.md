# Implementation plan — TS-SEC-101

## Design
- `core/auth/session.ts`: module-level epoch. `currentSession()`, `isSameSession(s)`, `advanceSession()`. A serial queue `runTokenWrite(fn)` so token mutations never interleave. `writeTokensIfSession(s, {access, refresh})` re-checks the epoch inside the queue and writes both keys, or neither.
- `AuthContext`: `advanceSession()` synchronously at the start of `signOut`, in the forced-logout callback, and on sign-in success. Token deletes and sign-in writes go through the queue. Forced sign-out still skips cleanups.
- `SecurityScreen.submit`: capture `currentSession()` before the request; write only through `writeTokensIfSession`; skip UI success work if the session changed.
- `ProfileScreen.exportData/downloadAll`, `GroupSettingsSheet.handleExport` and invite share: capture the session at the start; drop the result before `Share.share` if it changed.
- `apiFetch.attemptRefresh`: the two token writes go through the queue with the existing owner check re-evaluated inside it. A refresh never advances the epoch.
- `core/auth/SessionQueryProvider.tsx` (+ tests, from the template) mounted in `CoreApp` inside `AuthProvider`; module-level client removed.

- Web: `context/SessionQueryProvider.tsx` (uses `hooks/useSessionIdentity`) replaces the module-level client in `App.tsx`.
- Mobile `features/ask/utils/aiConsent.ts`: owner-tagged value `granted:<email>` (lower-cased), cache and pending prompt keyed by owner, `record` re-checks the signed-in account, `clearAiConsent` unchanged for explicit sign-out.
- Backend `NotificationService.register_device`: delete other users' rows for the same token before upserting; `RegisterDeviceRequest` validates the Expo token format and platform; `POST /devices/register` limited to 60/hour (a review found registering would otherwise be an unlimited de-registration primitive for anyone holding a token).
- Web provider remounts its subtree on a client swap (`key` by generation: useQuery/useMutation never rebind to a new client) and clears the replaced client at the swap site (StrictMode-safe).

## Trust boundaries and failure scenarios
Late async results from a previous session (password change, export, mutation) must never write tokens, cache or UI belonging to the next session. Same user signing out and back in is a new session. A normal refresh is not.

## Order
1. Failing tests (TS-SEC-101 test-plan). 2. `session.ts` + AuthContext. 3. SessionQueryProvider + CoreApp. 4. SecurityScreen, exports, apiFetch. 5. E2E flow. 6. docs (`CORE_BOUNDARY.md`, mobile AGENTS.md decision, CHANGELOG). 7. `make check`, routed reviewers.

## Rollout and recovery
Client-only, no migration, no key rename; revert by reverting the change. Persisted tokens and drafts are untouched.
