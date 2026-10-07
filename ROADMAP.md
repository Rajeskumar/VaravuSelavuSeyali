# Roadmap / Planned Enhancements

Format: `- [ ] [enhancement] — context: [why/when this came up]`

## Product gaps
- [ ] Card Coach catalog: add widely held cards (Amex, Citi, Discover…) with sourced earning rules — context: 2026-10-05 launch audit; only 8 cards exist and rules must come from issuer terms, not guesses.
- [ ] Recurring: weekly/yearly frequencies and "looks recurring — track it?" suggestions from repeated charges; add a Subscriptions category — context: 2026-10-05 launch audit (Netflix/Comcast went undetected).
- [ ] Budgets on full category path, not subcategory name — context: expenses store only the subcategory, so an "Other" budget counts every group's "Other" (UI now says so). Needs a schema change (2026-10-05 audit).
- [ ] Undo for deleted expenses (soft delete + restore endpoint) — context: 2026-10-05 audit; delete shows a toast but can't be undone.
- [ ] Personal currency/locale setting and app-wide notification preferences on Account — context: 2026-10-05 audit; needs product decisions.
- [ ] Optionally merge name-only group members across groups (user-confirmed link) — context: People tab now labels them by group; automatic merging by name is unsafe (2026-10-05 audit).
- [ ] Savings goals — context: `docs/FEATURE_STATUS.md` §4 lists them as having no implementation at all.
- [ ] Bank sync (Plaid) — context: FEATURE_STATUS §4, a roadmap item described as not urgent.
- [ ] Proactive "cheaper elsewhere" store alerts — context: FEATURE_STATUS §3. The data exists in `item_price_history`, but it only surfaces reactively.
- [ ] "Zombie expense" / micro-habit clustering — context: FEATURE_STATUS §3. Only manual recurring templates exist today.
- [ ] Deeper item/unit canonicalization (TS-ANL-009) — context: FEATURE_STATUS §2. Currently only merchant-name trim/lowercase is handled, plus the TS-ENT entity resolution behind a flag.
- [ ] Card Coach: annual-fee break-even check and a reward-gap trend — context: Phase 2 candidates that weren't picked (2026-09).
- [ ] AI chat: update/delete tools — context: deliberately out of scope (no undo). Revisit only with a confirm step.

## Quality / launch readiness
- [ ] Turn on group push notifications in real builds: `eas init` (projectId), real bundle id/package, APNs key + build with `TRACKSPENSE_ENABLE_PUSH=1`, Firebase/FCM V1 for Android, then a physical-device test — context: 2026-10-05 check found the code complete but no device had ever registered; steps in `varavu_selavu_mobile/README.md`.
- [ ] Legal pages: `privacy_policy.html` / `terms_of_service.html` still show the "Draft template — review before publishing" banner. Have them reviewed, remove the banner, and consider serving them inside the web app (they're plain backend pages today) — context: 2026-10-05 readiness review.
- [ ] Confirm the production Google OAuth client lists the production web origin, and that production SMTP delivers verification/reset mail (SPF/DKIM) — context: 2026-10-05 readiness review; the web app now hides a failed Google button but can't fix the origin.
- [ ] Mobile Home first-run checklist (log expense / group / budget / card), matching web's `GettingStartedChecklist` — context: web shipped it 2026-10-05; mobile Home is a designed screen, so it needs a design pass first.
- [ ] By 2026-11-04: re-check `braces` (GHSA-vfj7-8cjw-p6xm) and `node-forge` (GHSA-86w9-cpqp-85rv) for patched releases; renew or remove their entries in `varavu_selavu_mobile/audit-allowlist.json` (`make audit-mobile` fails after that date) — context: both unpatched, build-tooling only (2026-10-04).
- [ ] Expo SDK 57: interactive smoke test on the simulator (login, Ask chat, add expense, receipt scan) and an Android native build (no Android SDK on the dev Mac) — context: iOS Release build verified launching on iOS 27 / Xcode 27 on 2026-10-04; drop withSceneLifecycle.js once on SDK 58+.
- [ ] Automated cross-user IDOR tests across endpoints — context: FEATURE_STATUS §4. Auth logic looks right, but nothing proves it.
- [ ] Reproducible reviewer demo-account seed script for app-store review — context: FEATURE_STATUS §4.
- [ ] Budgets: bound `alert_thresholds` (0–100, max length) and add client tests — context: FEATURE_STATUS §6a known gaps (as of 2026-08-14; worth re-verifying).
- [ ] Verify the `MODEL_PRICES_PER_1M` estimates in `services/ai_quota_service.py`, especially `gemini-3.1-flash-lite` — context: the global AI spend cap is only as accurate as this table (2026-09-26).
- [ ] Prevent AI-quota reset by deleting and re-registering an account — context: known gap noted when quotas shipped (2026-09-26).
- [ ] Measure receipt-parser accuracy on real receipt photos (`scripts/eval_receipts.py`) before trusting OCR accuracy numbers — context: the synthetic-render evals passed but aren't representative (2026-09-26).

## Infra
- [ ] Lock Cloud Run ingress to Cloudflare (or require a shared-secret header) — context: the `*.run.app` URL bypasses the edge, so `CF-Connecting-IP` can be spoofed (`core/limiter.py` note; 2026-09-11 audit leftovers).
- [ ] Mobile App Links / Universal Links — context: open infra item from the 2026-09-11 audit.
- [ ] Manage Cloud Run env vars/secrets in `cloudbuild*.yaml` instead of by hand — context: prod env isn't reproducible from source (2026-09-11 audit).
- [ ] Least-privilege IAM: split the deploy and runtime service accounts — context: `docs/INFRASTRUCTURE.md` §10.
- [ ] Consolidate the Cloudflare DNS mechanisms for sibling subdomains — context: INFRASTRUCTURE §10. Low priority.

## Local customer review follow-up (2026-10-05)
- [ ] LR-01 (legal pages still draft templates) is the product owner's — see the legal-pages item above. LR-02–LR-07 fixed 2026-10-05 (trust copy, stale group/recurring views, export labelling + month filter, negative input, Terms link); retest them and complete the report's untested release flows (real mail, second-user invites, splits/receipts/CSV contents, native apps) on a frozen release candidate — `docs/product_review&testing_report/TrackSpense_Local_Customer_Review_2026-10-05.md`.
- [ ] "Sign out of all devices": revoke every refresh-token family for the user (and shorten/deny outstanding access tokens) — context: logout only revokes the presented session's family, so the homepage claim was reworded instead (LR-02, 2026-10-05).
- [ ] CSV export: optionally honour search, tags and the personal/groups scope toggle (it now honours the month and says it's "yours + group shares") — context: LR-05.

## Mobile responsive review follow-up (2026-10-05)
M-01–M-09 were fixed in code on 2026-10-06 (accessible amount input and keypad, sheets below the app bar, wrapping member actions and split tabs, auto-hiding Add button, 44px targets, dark-mode date icon, show/hide password + tel + 16px chat input, collapsed settled groups) and covered by `qa/e2e/tests/regression/mobile-usability.spec.ts`. What's left:
- [ ] Retest the P1 paths on real iOS Safari and Android Chrome (software keyboard, safe-area insets, focus order) — the review's own unverified release requirement; resizing a desktop browser can't prove it.
- [ ] Bottom-nav items are `role="link"` divs with no tab stop — make them real links so keyboard/switch users can reach them — context: spotted while verifying M-01; not in the review.
- [ ] Require the `Unit tests` workflow (`.github/workflows/unit.yml`) in branch protection once it has been green for a few runs — context: Jest had no gate before 2026-10-06.
- [ ] Run `make qa-all` (fresh QA personas) once on the next release candidate to confirm the new Playwright specs pass under the normal setup; they were verified with a borrowed session — context: 2026-10-06.

## Security and privacy review follow-up (2026-10-06)
All findings were fixed in code. Remaining, and not code-only:
- [ ] Store AI consent per account on the server (`users.ai_consent_at`) and enforce it on `/analysis/chat` too; today it is per device, enforced server-side only for categorize and receipt parsing — context: 2026-10-06 review, AI disclosure.
- [ ] Confirm before publishing: the AI provider's retention and no-training terms for the Gemini API plan in use, and backup retention; both are marked `[CONFIRM …]` in `privacy_policy.html`.
- [ ] Add-member by email still reveals whether a verified account exists (success vs failure). A neutral flow means inviting everyone by email and letting them accept; rate limits (30/hour) bound it for now.
- [ ] Put the rate limiter on Redis (`RATE_LIMIT_STORAGE_URI`) and lock Cloud Run ingress to Cloudflare — already listed under Infra; still the real brute-force control.
- [ ] Verify in production, not locally: headers after Cloudflare, `ENVIRONMENT`/`AUTH_COOKIE_SECURE`, CORS origins, that `*.run.app` is not reachable, and that `/docs` returns 404.
- [ ] Production `INLINE_RUNTIME_CHUNK=false` build + new CSP: smoke-test login, Google sign-in and analytics consent on a deployed build (verified locally by inspecting `build/index.html` only).

## Performance and reliability review follow-up (2026-10-06)
- [x] PR-01/02: account-scoped draft recovery after auth loss/reload; clear feedback, successful-save/discard cleanup and unknown-save guard (web + native).
- [x] PR-03: keep web Ask conversations and pending results across close/reopen and responsive transitions; native Ask tab already retains navigation state.
- [x] PR-04: retain web expense search/month/tags/scope in the URL and scroll position through history navigation.
- [x] PR-05 client handling: bounded header/body waits, caller cancellation, no automatic network/write retries, transient-refresh failures retain auth; expense read failures show Retry and partial-data messaging. Deterministic fault tests cover offline, timeout, 5xx, failed refresh and ambiguous writes.
- [x] Receipt performance: load the HEIC converter only for HEIC files; optimized local initial gzip JavaScript reduced from 701 kB to 363 kB.
- [ ] Validate on deployed staging with representative data and real iOS Safari/Android Chrome; test native draft recovery across process restart and software keyboard behavior. Measure deployed optimized assets/Core Web Vitals; local build and unit tests do not establish production latency.
- [ ] Establish redacted RUM/API/save-outcome/error-budget monitoring and alerts in the production project. See `docs/features/performance-recovery.md` and the performance review for acceptance and operational checks.
