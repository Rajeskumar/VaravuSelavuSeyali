# Requirement agreement

Status: agreed (bug fix; user request "fix the QA failures and re-run", 2026-11-22). Owner and acceptance criteria: work-item.json.

## Problem and users
QA CI (`qa.yml`) has failed on `main` since PR #43 (run 45106153579 on candidate `51900fc`), blocking release. Two tests pass in the Chromium pass and fail in the later Firefox/WebKit pass of the same job, which reuses the same backend and QA persona:

1. `analysis-budgets-cards.spec.ts:21` — Analysis category total is exactly $65.00 more than the Dashboard hero total (four runs, different bases).
2. `receipt-scan.spec.ts:60` — clicking "Remove item" on a scanned receipt times out: Playwright reports a `MuiBox` element intercepting pointer events.

Affected users: anyone who has deleted, archived or left a group with expenses in the month (1) — the Dashboard headline undercounts their spending versus Analysis; and anyone whose New expense dialog grows long, e.g. with several groups (2).

## Outcome and scope
AC-001..AC-003 (totals), AC-004 (dialog), AC-005 (CI). Both clients for the totals (web `TrueTotalHero`, mobile `dashboardTotals`). The receipt dialog issue is web desktop (mobile uses its own screen).
Out of scope: changing which groups count as spending anywhere else; changing the groups strip.

## Decisions and open questions
- D1 (source: code survey, 2026-11-22): spending counts regardless of group status — `_compute_group_leg` (Analysis totals), budgets, analytics and the expense list all ignore group status; only `_compute_group_summaries` filters to active groups for the "your groups" list. The Dashboard headline therefore takes the server's `spend_breakdown` group figures instead of summing the display list. No product rule changes.
- Receipt dialog root cause (reproduced on a local CI-mirror stack): the desktop dialog paper is a flex column; the ScannedItemsCard (overflow:hidden, so min-height 0) was the flex item that shrank once the content outgrew the window, collapsing to its 2px border. Fix: the card never shrinks.
- D2 (found while reproducing; AC-006): the future-date rule is new in this release (commit e612012), and web defaulted new expenses to `toISOString()` — the UTC date — so every evening west of UTC the default was "tomorrow", flagged as future, and Save stayed disabled. CI runs in UTC and never saw it; four local QA failures and two existing Jest tests failed for this reason on a CST machine. Fixed with a local `todayIso()` on web and mobile.
- D3: the QA receipt tests that need a successful scan wait out the 3/minute parse limit (shared by every browser project on one IP) instead of failing; the limit is unchanged.
