# Work item — Account-isolation polish and parity (from TS-SEC-101)

Status: backlog, not planned. Created 2026-11-25 from open findings S-9, S-10, S-15, S-17 of TS-SEC-101 (`docs/sdlc/work-items/TS-SEC-101/findings.json`), with the owner's approval.

## S-9 (P3): dropped password change gives no hint
A password change that succeeded on the server but was dropped after sign-out leaves the user on the login screen with no sign the password changed. Optional info toast; a UX decision.

## S-10 (P3): native E2E coverage
`account-switch` passed on iOS on the final build; Android was not run, and the flow was never run against pre-fix code. Run it on Android (SDK under `qa/mobile/.tools`), and consider a failing-first native run.

## S-15 (P3): mobile query-client provider remount
Mobile `core/auth/SessionQueryProvider` (and the template's copy) does not remount its subtree on a client swap, unlike the web fix. Unreachable today (mobile always passes through signed-out, which unmounts the signed-in tree); only worth doing together with the template.

## S-17 (P3): web identity edge cases
Web only sets `vs_user` when the login response has an email, so a cookie session without it would keep the query client across logins; web `utils/aiConsent` keys per `vs_user` without lower-casing.

## Notes
Not planned; urgency low. None blocks a release.

## Plan / Tests / Evidence
To be written at Discover and Plan.
