# Test specification — TS-SEC-101

Jest + `@testing-library/react-native`; native E2E in `qa/mobile` (Maestro). Failing-first for every case below.

| Scenario | AC IDs | Preconditions / fixture | Action | Expected outcome | Level / location |
|---|---|---|---|---|---|
| ISO-01 | AC-001 | Signed-in tree, cache holds account A data | Explicit sign-out, then account B sign-in | New client with an empty cache; old client cleared | Jest `SessionQueryProvider.test.tsx` |
| ISO-02 | AC-001 | Mutation in flight at sign-out | Resolve after sign-out | Old data not in the next account's cache | Jest same |
| ISO-03 | AC-001 | Token refresh, signed-out to signed-in | Token changes while signed in | Same client kept | Jest same |
| ISO-04 | AC-001 | Real `AuthProvider`, stub navigator | Explicit sign-out and forced 401, then sign-in | `CoreApp` mounts the provider: client replaced both ways | Jest `CoreApp.test.tsx` |
| ISO-05 | AC-002 | Epoch guard | Refresh, sign-out, sign-out + same-user sign-in | Refresh keeps the session; the others end it | Jest `session.test.ts` |
| ISO-06 | AC-002 | `changePassword` resolves late | Sign-out or another user signs in first | Tokens not written | Jest `SecurityScreen.test.tsx` |
| ISO-07 | AC-002 | Sign-out between check and the two writes | Interleave sign-out in the queue | Neither token remains after sign-out; no half write | Jest `session.test.ts` |
| ISO-08 | AC-002 | Refresh in flight at sign-out | Resolve late | Refreshed tokens not written | Jest `apiFetch` test |
| ISO-09 | AC-003 | Export or invite share resolves late | Sign-out first | `Share.share` not called | Jest Profile and GroupSettings tests |
| ISO-10 | AC-003 | Same flows, same session | Export | Share called once | Jest |
| ISO-11 | AC-001, AC-004 | Native, two users | A views key-less cached screens, signs out, B signs in | B sees none of A's data | Maestro `account-switch.yaml` (not run without Maestro/simulator) |
| ISO-12 | AC-004 | Whole mobile tree | Review module-level and persisted caches | Findings recorded | Review |
| ISO-13 | AC-005 | Web provider with real `vs_user` + `vs_auth_changed` | Logout, forced logout, switch in another tab, in-flight save | New empty client; old cleared; late save stays in the old client; kept signed-out to signed-in; App mounts it | Jest web `SessionQueryProvider.test.tsx`, `App.session.test.tsx` |
| ISO-14 | AC-006 | Stored `user_email` switched without cleanups | A allows, B asks; prompt left open by A; older bare `granted`; no account | B asked; open prompt cannot consent B; legacy value not trusted; same account keeps it | Jest `aiConsent.test.ts` |
| ISO-15 | AC-007 | Two users, one Expo token | A registers, B registers the same token | Only B's row; other tokens untouched | pytest `test_devices_api.py` |

Evidence IDs: `checks`, `session-query-cache`, `token-write-guard`, `late-export-guard`, `native-e2e`, `web-session-cache`, `ai-consent-owner`, `push-device-takeover`, `docs`, `code-review`, `security-review`, `acceptance`.
