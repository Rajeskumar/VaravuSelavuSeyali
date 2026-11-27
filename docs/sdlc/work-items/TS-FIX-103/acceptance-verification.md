# Verification notes (2026-11-27, local uncommitted tree on 9021c2a; not CI, not recorded as gate evidence)

- Failing first: Jest (reversed `me>bob` for a guest debt; payers resent as 30; no reload after move; $99 cached pre-fill; editor errors after an amount-only change; reset-script guard tests). AC-004: native flow failed on the unfixed build with the header off screen.
- Passing: Jest 670/670, mobile and QA typecheck, framework check. iOS 27 simulator, final code: 19 flows passed, Android-only OCR flow skipped. Keypad screenshot checked after the top-inset fix (taken before the later review fixes; ExpensesScreen unchanged since).
- Web `qa:account` on an isolated local stack: 4/4 passed.
- `make check`: test-integrity FAILS on the new single-browser `test.skip` until the owner acknowledges it.
- Reviews (one pass, before the review fixes): security no P0/P1, money changes no findings; code review no P0/P1, blocked on test-integrity; UI no P0/P1. Fixed: editor warnings, stale People-tab pre-fill, own-row tests, reset-script host guard, wrong web-parity statements. The rest is in ROADMAP. Reviewers have not re-checked those fixes.
- Open: Android native run, real devices, large text / small screen / lower-field focus, owner confirmation of implementation_approval.

## Update 2026-11-27 (supersedes the Android, test-integrity and web lines above)

- Android API 35 emulator, before the keyboard fix: 16 flows passed, 3 failed with the keyboard over the sheet, 1 iOS-only skipped; the 3 passed one at a time after the flows closed the keyboard.
- The owner then asked for the keyboard fix. Modals with text fields now lift above it and the flows no longer close it. Failing first: `sheetKeyboard.test.ts`. Mobile Jest 678/678 and tsc pass. Full Android run and iOS rerun: pending at commit time.
- Web on the isolated local stack: group specs 45/45, account specs 4/4, no 429.
- The owner approved the single-browser skip in `account-recovery.spec.ts`.
- Not yet reviewed: the last review fixes, the rewritten web lifecycle spec, later flow changes, the keyboard fix and the login limit test.

## Final update 2026-11-27 (supersedes the pending items above)

- Reviews (one pass each, on 6273a20 plus the first Android typing fix): security PASS (1 P2), code PASS for P0/P1 (2 P2), UI changes requested (1 P1, 6 P2). Fixed: UI P1 (Settle up scroll), misread group-edit amount, Android split-field append, Move to group keyboard handling, stale comment. **These fixes were not re-reviewed.** The rest is in ROADMAP.
- Failing first: four misread amounts and the uncovered Move modal (Jest). First Settle up fix put the action inside the scroll area and the iOS flow failed with it cut off; moved below the scroll area, then passed.
- Final code: mobile Jest 682/682, tsc; `make check` passes apart from the owner-approved skip.
- Native, final code (targeted): Android Settle up and exact split (with a temporary probe: four typed-over values all replaced), iOS Settle up. Android and iOS Move to group passed before the final Settle up change (keyboard not opened).
- Native, full suites before the review fixes: iOS 19/19 applicable; Android regression 14/14, smoke 2/5 finished (owner skipped the rest; **not passed**). No full run on the final code on either platform.
- Not verified: small phones, large text, real devices, screen readers.

## Amount reader and follow-up reviews, 2026-11-27 (later)

- AC-007 failing first: 5 Jest cases on the earlier code (comma group edit; Settle up comma and three unclear amounts) and the missing reader. Mobile Jest 708/708, tsc.
- AC-007 scope: the main amount field of Settle up and group edit. Split and payer fields inside group edit still drop a comma (ROADMAP); it is not claimed there. No device test with a comma keypad.
- Follow-up reviews of everything after 6273a20: code PASS, security PASS, UI earlier P1 resolved (iOS screenshot and code; Android by code), no P0/P1. After them one line changed (`nestedScrollEnabled` on the Move to group list), not re-reviewed or device-tested. Older wrong-amount findings are in ROADMAP for an owner decision.
- Not run on this version: native flows (full or targeted) and real devices. AC-004 rests on an iOS flow from before the review fixes.
