# Requirement agreement

Status: agreed (owner approved plan Rev 2 in this conversation, 2026-11-23). AC text: work-item.json.
Full design rationale: the approved plan (`~/.claude/plans/i-need-to-comeup-hazy-willow-of-2c5fd456-1d5c-4ee8-961a-2772a2dccd74.md`, local only); the durable decision goes in `docs/sdlc/` ADR during the spike (T1).

## Problem and users
Web and API have strong automated E2E (Playwright, `qa.yml`). The React Native app (`varavu_selavu_mobile`,
Expo SDK 57) has only Jest + tsc. The existing `mobile-iphone` Playwright project exercises the **web** app in a
390px window, not the native app. Native-only behavior (Yoga layout, SecureStore session/drafts, image picker,
on-device OCR module, deep links, scene lifecycle) is never exercised automatically; a past native layout bug
(SegmentedTabs) passed web verification and shipped blank on iOS. Native evidence is manual
(`.ai-sdlc/verification.md`); `docs/qa/06` B-19 and ROADMAP line 19 are open. Users: maintainers/CI.

## Outcome and scope
Black-box E2E (Maestro) on the real compiled app on **iOS Simulator and Android Emulator**, runnable locally,
with isolated scenarios, a safe test backend, honest failures and a release check that requires both platforms when mobile
code changed. Decisions (owner, 2026-11-23): iOS + Android; no device farm. Amended (owner, 2026-11-25): the native E2E
runs **locally at release time, only when mobile code changed since the previous release**; the GitHub Actions workflow
stays dormant (manual dispatch only) after the first CI runs showed hosted-runner limits (iOS build ~35 min, flows 3-7x
slower, an emulator launcher hang).
Included: AC-001..AC-008. Excluded (stay manual, tracked separately): real camera capture, real push delivery
and permissions, physical-device performance, signed install/upgrade, VoiceOver/TalkBack. The result is
"native simulator/emulator coverage", not complete mobile release coverage.
A deep-link scenario is expected to expose a web↔mobile parity gap (signed-out invite resume); it is reported,
not built, here.

## Decisions and open questions
- Maestro over Detox/Appium (no app instrumentation on SDK 57 / Xcode 27; Expo-recommended; already proposed in docs/qa/06).
- Open, to be settled by the spike (T1): exact `macos-26` Xcode version; Android Release build of `modules/receipt-ocr`; whether iOS Release build with e2e variant works on Xcode 27 / iOS 27 sim.
- Promotion to a required check is a separate owner action after criteria are met (plan §8).
