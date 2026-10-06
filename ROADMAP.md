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
- [ ] Resolve and retest LR-01–LR-07 from `docs/product_review&testing_report/TrackSpense_Local_Customer_Review_2026-10-05.md`: draft legal pages, trust copy, stale group/recurring views, export scope, negative input, and broken legal link; complete the report’s untested release flows on a frozen candidate.
