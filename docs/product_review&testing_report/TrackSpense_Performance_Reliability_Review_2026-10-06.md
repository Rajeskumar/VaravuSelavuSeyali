# TrackSpense performance and reliability review

Date: 2026-10-06 · Reviewer: Codex · Scope: local web application, desktop and 375px mobile viewport.

## Decision

**NOT READY for production sign-off.** Normal local interactions were responsive, but authentication loss can silently discard an expense draft. Production-build performance and critical failure/recovery paths remain unverified.

| Readiness | Provisional score |
|---|---:|
| Performance | 75/100 |
| Reliability | 65/100 |

These are reviewer assessments of observed behavior and available launch evidence, not Lighthouse scores, pass percentages, or production measurements. Confidence is limited by localhost, a small synthetic dataset, and a development frontend. No P0 outage or confirmed backend performance defect was observed.

## Method and limitations

Reviewed Dashboard, Expenses/search/new expense, Analysis, Cards, Groups/error recovery, Ask AI, and authentication-loss behavior. Tested desktop and a 375px desktop-browser viewport; this was not a native app or physical mobile-device review. Used the existing synthetic launch-review account. No stress tests or high-volume traffic were run.

The local checkout changed during review (initial HEAD 1659998; report-time HEAD 4d2cf54). Results describe the running local application, not a frozen release candidate. Product source was not changed by this review.

Browser tooling exposed UI state, screenshots and console messages, but did not expose usable Performance/Resource Timing, request interception, offline emulation, or HAR capture. Consequently this review does not establish Core Web Vitals, request duplication, API latency percentiles, cold-load performance, or production cache/compression behavior. Read-only HTTP transfers measured a few DOM-discovered local assets.

Natural token expiry, failed refresh, dropped connections during writes, 429/500/503 responses, forced timeouts, offline/reconnection, poor networks, partial API data, and representative-volume pagination remain untested. Cross-tab logout is evidence of authentication loss, not proof of timed session-expiry behavior. No backend outage was induced on the shared local service.

## Observed timings

Single samples, measured wall-clock around automation actions and visible UI completion. Includes automation overhead; these are neither browser performance metrics nor statistical benchmarks.

| Interaction | Desktop | 375px |
|---|---:|---:|
| Dashboard → Expenses controls | 166 ms | 154 ms |
| Search → empty result | 53 ms | 36 ms |
| Expenses → Analysis category data | 166 ms | — |
| Analysis → Cards data | 148 ms | — |
| Warm document reload → expense data | — | 431 ms |
| AI send → completed response | — | 1,460 ms |

No meaningful desktop/mobile speed difference can be inferred from these samples. The measured AI response was the longest continuously timed interaction, but was not itself a concerning delay. Other AI/save observations spanned tool gaps and were excluded from precise timing. No sustained freeze was observed.

## Findings

### PR-01 — Authentication loss discards a pending expense

- **Screen/workflow:** New expense; another tab signs out.
- **Severity / priority / classification:** High · P1 · Confirmed reliability issue.
- **Evidence:** Entered amount 2.34 and a synthetic draft description in the primary tab. Signed out through the normal account menu in a second tab. The primary tab changed to login underneath the still-open expense modal, whose Save remained enabled. Clicking Save dismissed the draft and left the login screen without a clear unsaved/session-expired explanation. After signing back in, the expense form was blank. No successful save was observed.
- **User impact:** A person can lose a completed financial entry and be uncertain whether it was recorded, encouraging re-entry or abandonment.
- **Recommended fix:** Coordinate auth loss with open forms, explicitly state that the entry was not saved, and offer reauthentication with draft recovery. Scope any retained sensitive draft to the account with short retention and cleanup. Do not automatically replay a financial write without idempotency and a known outcome.
- **Evidence image:** [Login after Save](performance-review-2026-10-06/auth-loss-save-error.png). The screenshot shows the final state; the sequence above records the preceding interaction.

### PR-02 — Refresh silently clears an unsaved expense

- **Screen/workflow:** New expense → browser reload.
- **Severity / priority / classification:** Medium · P2 · Confirmed reliability issue.
- **Evidence:** Filled amount 1.23 and an unsaved draft description, then reloaded. No browser leave-page confirmation appeared. Reopening New expense showed blank fields.
- **User impact:** Accidental reload or a mobile tab reload forces re-entry. This is draft loss, not loss of a successfully saved record.
- **Recommended fix:** Recover account-scoped drafts with appropriate retention, show a discard confirmation for in-app exits, and use a browser unload guard where supported. Test browser back, reload, tab eviction and sign-out separately.
- **Evidence image:** [Blank form after refresh](performance-review-2026-10-06/draft-after-refresh.png).

### PR-03 — Closing Ask loses the conversation while quota remains consumed

- **Screen/workflow:** Ask AI → ask questions → close → reopen.
- **Severity / priority / classification:** Medium · P2 · Confirmed reliability issue.
- **Evidence:** Received an October spending answer, submitted a September follow-up and observed Thinking with the composer disabled. After closing and reopening Ask, the conversation was gone and the welcome suggestions returned; remaining quota was 7/10. Completion relative to closing was not precisely captured, so continued server work after dismissal is not established.
- **User impact:** Users lose access to results and context and may spend another question repeating work.
- **Recommended fix:** Keep conversation/request state outside the temporary overlay and restore it on reopen. Define cancellation and quota behavior explicitly; show how to retrieve completed results.
- **Supporting source:** `varavu_selavu_ui/src/components/ask/AskOverlay.tsx` explicitly resets history on close by unmounting.
- **Evidence image:** [Ask reopened without history](performance-review-2026-10-06/chat-reopened-history-lost.png).

### PR-04 — Back navigation clears expense search

- **Screen/workflow:** Expenses search → Analysis → browser Back.
- **Severity / priority / classification:** Low · P3 · UX improvement with confirmed state loss.
- **Evidence:** Entered “Review Cafe”, navigated to Analysis and returned with Back. Expenses displayed the full list and an empty search box.
- **User impact:** Repeated investigation requires rebuilding filters and finding the previous position.
- **Recommended fix:** Preserve search/filter state in the URL or scoped navigation state, and restore list position. Verify forward navigation too.

## Investigation item: slow and failed requests

**PR-05 · Medium / P2 · Suspected resilience risk, not a confirmed backend defect.** A targeted supporting source check found a default 180,000 ms timeout and an AbortController in `varavu_selavu_ui/src/api/api.ts`. The client also attempts one refresh on a 401. These mechanisms exist; their user-visible failure behavior was not exercised.

A long request budget could leave a user waiting without a useful recovery path. Validate endpoint-specific timeout budgets, delayed-state messaging, cancellation for read/AI operations, and bounded safe retries. For financial writes, test reconciliation after an unknown outcome and server idempotency before enabling automatic retry. The AI loading state visibly disables duplicate sends, but cancellation and timeout recovery were not proven.

## Successful checks

- Double-clicking Save produced exactly one persisted synthetic 1.23 expense after reload. Disabled/loading feedback and success feedback were observed. This proves that tested interaction only, not server-wide idempotency under network retries or concurrent tabs. [Evidence](performance-review-2026-10-06/double-click-save-success.png).
- Successfully saved data survived a warm reload.
- Search empty-state feedback appeared promptly, and clearing filters restored results.
- A nonexistent group displayed “This group doesn't exist, or you're no longer a member.” Back to Groups recovered successfully. This does not establish generic 5xx recovery. [Evidence](performance-review-2026-10-06/missing-group-recovery.png).
- AI displayed Thinking, disabled input/send while pending, returned a completed response and updated quota. [375px evidence](performance-review-2026-10-06/mobile-ai-complete.png).
- Normal navigation, menus and dialogs showed no sustained freeze in the tested small dataset. A Cards tooltip warning appeared in the console; no associated crash was observed.

## Assets and initial load

The local development `/static/js/bundle.js` was 8,415,205 bytes uncompressed, with 1,490,376 transferred using compressed curl (approximately 0.123 seconds on loopback). This is **not evidence of the shipped production bundle size**. Measure the optimized deployed build before making bundle-splitting decisions.

The landing-page dashboard screenshot was 95,762 bytes, native 1656×1035 and displayed approximately 1150×719 on desktop. The app icon was 65,038 bytes, native 256×256 and displayed 30×30. These are optimization candidates, not demonstrated bottlenecks. No numerical layout-shift or cold-load finding is supported by the available measurements.

## Launch priorities and recovery gaps

| Priority | Required action |
|---|---|
| P0 | None confirmed in this review. |
| P1 | Fix PR-01 and verify sign-in-and-resume behavior without losing or duplicating a write. |
| P2 | Recover unsaved drafts (PR-02); preserve Ask results/context (PR-03); validate slow/failure behavior (PR-05). |
| P3 | Restore expense search and list position on Back (PR-04). |

**Production sign-off blockers:** unresolved P1 draft-loss behavior; no frozen optimized release-build measurements; no controlled evidence for offline/reconnection, timeout/5xx handling, failed refresh and ambiguous write outcomes. Missing evidence is a release-verification gap, not proof that those implementations are broken.

Slowest/problematic workflows: AI has the longest measured wait; expense entry across refresh/auth loss and Ask close/reopen are the demonstrated recovery problems. No normally operating API-driven screen was demonstrably slow with this dataset. Pagination/infinite scroll and expensive analytics need representative data before a scalability conclusion.

Before sign-off, run low-volume staged fault tests: delay and fail reads, expire/revoke auth during an open draft, drop the response after a committed write, and reconnect. Verify actionable errors, preserved input, safe retry and exactly one resulting record. Repeat on real mobile browsers under constrained networks. Check pagination/filters with representative records and establish desktop/mobile cold and warm load baselines on the optimized deployment.

## Monitoring and alerts before launch

Recommendations below are proposed, not installed or verified by this review.

1. **Real-user performance:** capture route/device-segmented LCP, INP and CLS without recording financial text. Target the good thresholds at the 75th percentile: LCP ≤2.5 seconds, INP ≤200 ms, CLS ≤0.1. [Google Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds).
2. **API experience:** track latency percentiles, 5xx, timeouts and 429 by endpoint; report AI/OCR separately from ordinary reads and saves. Track save success/failure/unknown outcomes, duplicate prevention and auth-refresh failures.
3. **Frontend failures:** collect uncaught errors, unhandled rejections and failed asset loads with release identifiers, while redacting user data.
4. **Infrastructure:** watch Cloud Run restarts, memory exhaustion, cold starts, database connection pressure and background-job failures. Track AI/provider errors, latency, quota rejection and spend-cap events.
5. **Availability:** agree an availability SLO with the release owner and use fast/slow error-budget burn alerts. [Google Cloud burn-rate alerting](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate).
6. **Synthetic checks:** use a dedicated test account for low-rate login/read checks and controlled create/read verification with cleanup in staging, respecting authentication rate limits.

## Review artifacts and retained data

The synthetic account retains one new expense, “Perf duplicate check 20261006”, amount 1.23, for reproduction. Personal total became 32.98 and combined total 62.98. No real payment, invitation or destructive data change was performed. Synthetic-account AI consent was accepted and three questions were used. Temporary second browser tab was closed and desktop viewport restored.

This review did not rerun implementation test suites or certify earlier security, accessibility or native-mobile audits. No product-code fixes, monitoring deployment or production changes were made.


## Approved implementation and retest — 2026-10-06

The earlier findings and scores above record the original audit. The following work was implemented after approval; it does not retroactively change the observations or certify a production deployment.

| Item | Implementation / evidence | Status |
|---|---|---|
| PR-01 | Auth loss closes protected capture, explains sign-in recovery and restores the same-account draft. Cross-tab sign-out → login → restored draft passed in the actual local browser. Old-account refresh failures cannot end a new account's session. | Fixed; staging expiry tests pending |
| PR-02 | Full structured, account-scoped drafts survive local reload; explicit confirmed Discard removes them. One-hour recovery TTL; no photos/tokens in the draft. Web and native tests cover isolation, expiry and storage races; native custom splits survive closure. | Fixed; native process-restart/device check pending |
| PR-03 | Conversation/request state is above the responsive drawer. Completed answer survived close/reopen and a 375-to-1440px transition. A deferred-request regression test proves the pending result survives remount without another chat submission. | Fixed |
| PR-04 | URL search/month/tag/scope and per-history scroll state; actual Back retained “Review Cafe” and its filtered row. | Fixed; long-list/device scroll check pending |
| PR-05 | 30s ordinary / 120s chat-receipt / 15s refresh budgets cover headers and body reads. Offline, cancellation, 5xx, rejected/transient refresh and ambiguous-write behavior have deterministic tests. Failed/partial Expenses reads show Retry. Unknown saves are not replayed automatically. | Client risk addressed; real-service fault tests pending |
| Asset improvement | HEIC conversion loads only for HEIC selection. Initial optimized gzip JS: **701.42 → 362.99 kB (48.2% smaller)**. PNG/JPEG/PDF, converted camera parsing and conversion failures have regression tests. | Measured local build improvement |

**Verification:** final `scripts/quality/verify.sh --build` passed: backend **914 passed / 7 skipped**, web **219 tests / 42 suites**, native **194 tests / 27 suites**, ESLint, TypeScript and optimized build. Full release-check/audits also passed earlier; mobile uses its existing documented advisory allowlist. Security and focused accessibility scripts passed. Final scoped self-review found no remaining P0/P1 in this implementation; optional gitleaks, screen-reader and native device/build checks were not completed.

**Remaining launch evidence:** deployed optimized-build cold/warm performance, representative data/pagination, staged failure/reconnection and committed-write/dropped-response reconciliation, real mobile browsers, native process-restart tests, and redacted production monitoring/alerts. Client guards do not establish server-wide idempotency for deliberate manual retries. Scores are not recalculated from unit tests; production sign-off remains pending.

Browser retest proof: [restored draft](performance-review-2026-10-06/draft-recovery-fixed.png), [retained Ask answer](performance-review-2026-10-06/chat-retention-fixed.png), [responsive chat retention](performance-review-2026-10-06/chat-responsive-retention-fixed.png), [320px dark draft controls](performance-review-2026-10-06/draft-controls-320-dark.png).

Implementation details, privacy and operational acceptance criteria: [performance recovery](../features/performance-recovery.md). No new expenses were saved during implementation; synthetic unsaved drafts were discarded. The implementation retest used two AI questions on the existing synthetic account (8/10 remaining), closed its temporary second tab and reset viewport/theme. Code remains uncommitted.
