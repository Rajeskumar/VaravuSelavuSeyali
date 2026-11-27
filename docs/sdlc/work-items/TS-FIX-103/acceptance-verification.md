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
