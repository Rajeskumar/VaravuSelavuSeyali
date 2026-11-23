# Implementation plan

Status: proposed. Requirements: requirements.md; AC text: work-item.json.

## Architecture and contracts
- Root cause (1): `AnalysisService._compute_group_summaries` lists only active memberships in active groups; `_compute_group_leg` (inside `total_expenses` and `spend_breakdown.group_share`) counts every group. Web `computeMyExpensesTotal`/`computeIPaidTotal` and mobile `dashboardTotals` add `group_summaries` to the personal total, so a deleted/archived/left group's shares drop out of the hero only. The QA cleanup helper soft-deletes test groups between passes, leaving a $65 share.
- Fix: `spend_breakdown` gains `i_paid_share`, computed once per request as a SQL SUM (`_group_i_paid_total`) over the same query builder as the legs (`_group_leg_query`), reused by the tag-filtered totals; additive field, optional on clients. Both clients compute the hero from `spend_breakdown.personal + group_share` / `+ i_paid_share`, falling back to the summaries only if the field is absent (older server during rollout). `group_summaries` unchanged.
- Root cause (2): ScannedItemsCard collapsed as a shrinking flex item (overflow:hidden ⇒ min-height 0) inside the MUI Dialog paper. Fix: `flexShrink: 0` on the card.
- Root cause (3, AC-006): UTC `toISOString()` date defaults vs local future-date bounds. Fix: `todayIso()` (local) in `utils/expenseDates` on web and mobile; every `toISOString().split('T')[0]` default replaced.

## Risks and safeguards
Money: totals stay server-computed Decimal-rounded floats as today; no new arithmetic beyond one addition per lens. API: additive response field only. Performance: one extra grouped query per combined analysis call (same query shape as the my_share leg). No auth, permissions, migrations or privacy impact.

## Ordered tasks
- [ ] T1: backend `analysis_service.py` add `spend_breakdown.i_paid_share`; tests for deleted/archived/left group shares in totals vs summaries (backend-tests)
- [ ] T2: web `TrueTotalHero.tsx` + `api/analysis.ts` use spend_breakdown; unit tests (web-tests)
- [ ] T3: mobile — Home already shows `total_expenses` (correct, no screen change); align the unused `dashboardTotals` helpers + `api/analysis.ts` type so they can't reintroduce the bug; unit tests (mobile-tests)
- [ ] T4: receipt dialog: `ScannedItemsCard` flexShrink 0; receipt-scan e2e at a 520px window asserts card height; scanUntilParsed waits out the parse rate limit (web-tests, qa-local-repro, accessibility-review)
- [ ] T4b: local default dates: `todayIso()` web+mobile; QuickCapture evening test; todayIso unit tests (web-tests, mobile-tests)
- [ ] T5: local CI-mirror QA run Chromium→Firefox green (qa-local-repro); push; QA CI green (qa-ci)

## Verification and documentation
verify.sh, route-review.sh reviewers, spec note on hero totals, CHANGELOG.
