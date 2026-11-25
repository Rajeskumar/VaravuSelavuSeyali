# 0001 - Native mobile E2E: Maestro on iOS Simulator and Android Emulator

Status: accepted (owner approved the plan, 2026-11-23). Work item: TS-QA-103. Supersedes: none.

## Context
Web and API have strong automated E2E (Playwright, `qa.yml`). The React Native app only had Jest + tsc; the
`mobile-iphone` Playwright project drives the *web* app in a phone-sized window. Native-only behaviour (Yoga
layout, SecureStore session and drafts, native navigation, the image picker, on-device OCR, deep links, system
sheets, accessibility) was never exercised automatically, and a native layout bug had already shipped that the
web preview could not show.

## Decision
Black-box E2E with **Maestro** on the real compiled app, on an **iOS Simulator and an Android Emulator**, against
an isolated local backend, in `qa/mobile/`, run by `.github/workflows/mobile-e2e.yml`. Simulator/emulator only:
real-device checks (camera capture, push delivery, device performance, signed install/upgrade, VoiceOver/TalkBack)
stay manual (`docs/qa/08-release-readiness-checklist.md`).

Alternatives: **Detox** (grey-box) needs a native harness in the prebuild and breaks on RN/Xcode bumps; this repo is
on Expo SDK 57 / Xcode 27. **Appium** is heavier and flakier. Detox remains the fallback if grey-box
synchronisation is ever needed.

## Constraints discovered building it (do not re-learn)
- **The test build is a build *variant*, not a debug build.** `EXPO_PUBLIC_APP_VARIANT=e2e` is the only way a
  non-dev build may use `EXPO_PUBLIC_API_URL`, only for a local test backend origin; `withE2eVariant.js` refuses it
  for EAS and push-enabled builds. The tested artifact is checksummed (`build-evidence-*.json`) and `run.sh` refuses a
  mismatch.
- **The app's API port is compiled in**, so the test backend uses a fixed port (18080), not a random one.
- **The backend reads `.env` twice** (`load_dotenv()` and pydantic `env_file`). Setting a few variables is not
  isolation, so the launcher builds the whole environment from an allowlist, disables `load_dotenv`, runs in an
  empty directory, and refuses any database that is not a local `trackspense_e2e_*` one.
- **Xcode's bundle phase does not inherit the shell environment**, and `pod install` rewrites `ios/.xcode.env.local`;
  the build writes the variant there after the pods are installed and builds with `--no-install`. A post-build check
  that the URL is in the bundle caught this (Hermes bytecode still contains the string).
- **Maestro vs iOS**: `eraseText` does not clear a secure field (start a clean launch instead); `hideKeyboard` does
  not work inside the Add sheet (press Return); the system "Save Password?" sheet hides the app from the
  accessibility tree (dismiss with "Not Now"); the toast label includes its icon (match with wildcards).
- **An accessible container collapses its whole subtree into one iOS accessibility element.** The first native run
  found it in the Add Expense sheet and the shared `Sheet` (a default-accessible `Pressable` panel), and it was
  everywhere sheets are built, including overlays whose *backdrop* wraps the content. Rule (enforced by the source
  contract `varavu_selavu_mobile/src/core/ui/sheetAccessibility.test.ts`): sheet panels and backdrops are
  `accessible={false}` (+ `focusable={false}` on panels); a backdrop must never get a label or role (a first attempt that
  named backdrops "Dismiss" left the tree with only that node, caught on the simulator); every sheet handles the
  VoiceOver escape gesture on an ancestor of its content (a handler on a sibling backdrop never fires).
- **The build clone must keep the local native module.** `rsync --exclude ios --exclude android` is unanchored: it also removed
  `modules/receipt-ocr/ios` and `/android` from the clone, so the first e2e builds shipped WITHOUT on-device OCR and the app
  quietly fell back to uploading receipt images (every OCR failure in the app is silent by design). Excludes are now anchored
  (`/ios`), the build fails if the module folders are missing or `ReceiptOcr` is not in `Podfile.lock`, and the
  `receipt-import` flow asserts from the proxy log that `parse_ocr` was posted and the image was not uploaded.
- **Fault injection sits in a proxy, not in the app or the backend.** The app's API port is compiled in, so the proxy takes it and the
  backend moves behind it; harness traffic bypasses the proxy so seeding never meets a fault.
- Real sign-in and the real 5-logins/minute limit stay on; the harness seeds and verifies with tokens minted from a
  per-run secret and paces flows by their declared `# LOGINS: n`.

## Consequences
- A native bug class that web cannot show now fails in CI (once promoted).
- iOS builds need Xcode 26.4+ (`macos-26`); a from-scratch iOS build takes ~15 min; Android builds in a few minutes once Gradle is warm and was verified locally on an arm64 emulator (the CI x86_64 emulator is not yet exercised).
- Owner decision 2026-11-24: the device jobs run only for changes that can affect the native app or the suite (see
  `qa/mobile/README.md` "When CI runs it"), on pull requests and on pushes to `main`, not on every change as first planned. The
  trade-off: a backend-only change no longer runs the app on emulators before merge (the backend/QA workflows cover the API; the
  nightly run exercises the app against the current backend), and a release candidate with no mobile change in its push has no
  regression run, so one is dispatched for it before the release gate (AC-007 still requires successful `ios (regression)` and
  `android (regression)` jobs on the exact commit; it never required them to run automatically).
- Owner decision 2026-11-25 (supersedes the CI parts above): the native E2E runs LOCALLY at release time, only when mobile code
  changed since the previous release (`release_tools.py prepare` adds a required `native-mobile-e2e` check; not applicable otherwise).
  The workflow is dormant (manual dispatch only). Why: the first hosted-runner runs took ~35 min to build iOS with flows 3-7x
  slower (the 60-minute job timed out), and the Android emulator's launcher hung with the action's default 2 cores. The same runs
  exposed a gate bug (a FAIL verdict piped through `tee` without pipefail passed the job), fixed with `shell: bash`.
- The workflow is advisory until the promotion criteria in TS-QA-103 are met; `Native mobile gate` is the only job
  meant to become a required check, and `release-gate.py` can require both platforms' regression jobs
  (`ENFORCE_MOBILE_E2E`, off until promotion).
