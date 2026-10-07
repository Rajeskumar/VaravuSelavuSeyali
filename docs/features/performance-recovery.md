# Performance review: recovery implementation

Approved scope: PR-01–PR-05 from the 2026-10-06 local performance/reliability review.

## Acceptance criteria

- Closing or reloading Quick Capture preserves the structured entry; reopening or signing back into the same account restores it for review.
- Authentication loss closes protected forms and explains recovery; Save cannot run for a signed-out or changed account.
- Drafts include receipt items, date, merchant/category, tags/card and customized group payers/splits. Current group membership is fetched again before saving; a missing group or stale member never silently turns a group entry into a personal one.
- Success and confirmed Discard clear the matching draft. Deliberate local logout clears the local draft. Drafts cannot cross accounts and expire for recovery after one hour of inactivity.
- A pending write is recorded before dispatch. Interrupted/ambiguous outcomes block another Save until the user checks Expenses; transport never automatically replays a network/timeout/5xx failure. Late completion cannot erase a newer entry or another account's draft.
- Ask loads lazily, retains conversation and in-flight results across closing and responsive remounts, and clears on account change/logout. Native Ask remains mounted across ordinary tab navigation.
- Expense search/month/tags/scope survive web Back/Forward; scroll position is retained per history entry. Failed/partial reads display a warning and Retry rather than an empty ledger.
- Ordinary requests use 30-second budgets, chat/receipt ingestion 120 seconds and refresh 15 seconds. Header and body waits are bounded and caller cancellation works. Transient refresh failures retain the session; rejected credentials end it. 401 retry is single-flight and bounded to one retry.

- Receipt conversion loads HEIC tooling on demand. PNG/JPEG/PDF selection bypasses it; camera auto-parse still waits for conversion and consent. The initial optimized gzip JavaScript falls from 701.42 kB to approximately 363 kB; this measures asset size, not production load time.

## Privacy and behavior

Web drafts stay in tab session storage; native drafts use OS secure storage. No photo, password or token is in the draft. Expired data is removed on access. Blocked storage produces a warning. Native writes are serialized/coalesced to prevent stale writes from resurrecting cleared drafts. Local unsaved drafts are not server-exported records; the privacy policy explains their lifetime and removal.

Closing a sheet keeps the draft. Discard is a separate confirmed action. The application does not auto-submit restored entries. Stop waiting in web Ask ends the client wait; the server may still finish a request and quota is not promised to be refunded. Conversations remain in app memory and do not survive a document reload or process termination.

## Verification and operational checks

Tests cover account isolation/expiry, corrupted/blocked storage, late-completion races, draft restore/discard, duplicate clicks, unknown-save guards, offline/timeout/5xx failures, body stalls, failed/single-flight refresh, URL search restoration, partial reads, and responsive chat remounts. Native form tests use the actual form controls; auxiliary scanner/animation integrations are outside those unit tests.

Before public sign-off, verify the deployed frozen build with representative data, real mobile browsers and native process-restart behavior. Confirm staged delayed/failed reads, failed refresh and dropped write responses against the real service. Server-wide idempotency across deliberate manual resubmissions is not established by a client guard.

Configure redacted route/device performance measurements and API/save-outcome/error alerts in the production project. Measure ordinary API and AI/OCR latency separately; collect JavaScript/asset failures with release IDs. Agree an availability SLO and fast/slow burn alerts, and check Cloud Run memory/restarts, database connection pressure and background jobs. Do not log expense text, request bodies, credentials, full URLs with search terms, or conversation content. Monitoring deployment and production latency are separate release verification work.

## Final implementation verification — 2026-10-06

- `scripts/quality/verify.sh --build`: passed. Backend: 914 passed, 7 skipped; web: 42 suites / 219 tests; native: 27 suites / 194 tests. Web ESLint, both TypeScript checks and the optimized build passed.
- Earlier `scripts/quality/verify.sh --full --build`: passed the backend release checks and all dependency audit gates. The existing native advisory allowlist remains in effect; this does not mean every advisory is absent. No dependencies changed in this implementation.
- `scripts/quality/security.sh`: passed audit gates and tracked-file secret checks; optional gitleaks history scanning was unavailable. `scripts/quality/accessibility.sh`: passed lint and 16 focused tests; this is not a screen-reader certification. `git diff --check`: passed.
- Final initial JavaScript gzip size: 362.99 kB, down from 701.42 kB before deferred HEIC conversion (48.2%). HEIC conversion is now a separate 338.42 kB chunk; the existing heavy visualization chunk remains 377.39 kB. No production latency/Core Web Vitals conclusion follows from local build sizes.
- Actual localhost browser checks: same-account draft restoration after reload and cross-tab sign-out/login; protected form removal on auth loss; Expenses search retained on Back; Ask answer retained after closing and after 375-to-1440px transitions; draft controls visible at 320px in dark theme with no document horizontal overflow. Synthetic unsaved drafts were discarded after verification. No additional expenses were saved during implementation; two test-account AI questions were consumed.
- Scoped self-review used implementation, product, test, security, accessibility, UX and performance criteria. Two additional confirmed correctness bugs were reproduced and fixed: a late rejected refresh signing out a new account (both clients), and native sheet closure clearing a customized group split. Regression assertions failed before their fixes and passed afterward. No unresolved P0/P1 was identified in this implementation scope; verdict: **No blockers in the scoped code review**.
- Not verified here: frozen deployed release/CI status, representative-volume pagination and latency, controlled real-service delayed/dropped responses, full screen-reader behavior, native simulator/device build and process restart, or production monitoring deployment. Public launch sign-off remains pending those operational checks. Changes remain uncommitted.
