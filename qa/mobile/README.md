# Native mobile E2E (Maestro)

Black-box tests that drive the **real compiled TrackSpense app** on an iOS Simulator and an Android Emulator
against an isolated local backend. This is **not** `make qa-mobile` (that runs the *web* app in a phone-sized
Chromium window). Work item: TS-QA-103. Scope: simulator/emulator coverage only; real-device checks (camera
capture, push delivery, VoiceOver/TalkBack, signed install/upgrade) stay in `docs/qa/08-release-readiness-checklist.md`.

## Quick start (iOS, macOS with Xcode 26.4+)
```sh
make mobile-e2e-tools            # pinned Maestro + a portable JDK 17 into qa/mobile/.tools (gitignored, checksummed)
make mobile-e2e-build-ios        # ~15-25 min first time; builds a clone, your own ios/ folder is untouched
make mobile-e2e-ios              # smoke suite; FLOW=login-relaunch, SUITE=regression, RETRIES=1 optional
```
`run.sh` creates its own throwaway simulator (`trackspense-e2e-*`) and its own Postgres + API, runs the flows and
deletes everything. Reports: `qa/mobile/reports/ios-<runId>/` (JUnit, screenshots, `summary.json`).
Needs PostgreSQL server binaries (Homebrew `postgresql@16`); no Docker.
On macOS the scripts re-run themselves under `caffeinate` so an unattended run is not suspended by sleep (a step that spans a sleep fails hours later).

## When it runs: locally, at release time, when mobile code changed
Owner decision 2026-11-25: the native E2E is a **local, release-phase** step, required only when mobile code changed since the
previous release. `make release-prepare VERSION=x.y.z` checks the diff since the previous release tag against the mobile-affecting
paths (`MOBILE_AFFECTING_*` in `scripts/quality/mobile_e2e_gate.py`: `varavu_selavu_mobile/`, `qa/mobile/`, the workflow and gate
script, the backend launchers `qa/scripts/bootstrap_schema.py` / `provision_qa_session_user.py`; `routing.py` uses the same list,
a test keeps them identical) and, if any changed (or there is no previous tag), adds a required `native-mobile-e2e` check to the
release record. Run the full regression on both platforms against the candidate, then record that check as passed with both
reports (`qa/mobile/reports/<platform>-<runId>/summary.json`):

    make mobile-e2e-build-ios && make mobile-e2e-ios SUITE=regression
    make mobile-e2e-build-android && make mobile-e2e-android SUITE=regression

With no mobile change the check is recorded as not applicable. During development, run single flows as you work (`FLOW=`).
Backend-only changes do not make it required (owner decision); if a release changes an API the app uses, run it anyway.
On an emulator the suite did not start (`E2E_REUSE_EMULATOR=1`) it hides system crash/ANR dialogs for the run and restores
the previous setting afterwards.

**CI is dormant.** `.github/workflows/mobile-e2e.yml` only runs when started by hand (`gh workflow run mobile-e2e.yml -f suite=...`);
it has no pull request, push or nightly trigger. It is kept correct so it can be re-enabled by adding those triggers back (its
`changes` job then skips the device jobs for changes that cannot affect the native app). The first hosted-runner runs showed why
it is off for now: the iOS Release build took ~35 minutes and flows ran 3-7x slower than locally (the 60-minute job timed out),
and the Android launcher hung under the emulator action's default 2 cores (now 4 cores / 4 GB in the workflow).

## Android (local)
No Android SDK is needed system-wide. `qa/mobile/scripts/install-android-sdk.sh --accept-licenses` installs a pinned SDK, NDK and an
arm64 emulator image into `qa/mobile/.tools/android-sdk` (several GB; `--accept-licenses` accepts Google's Android SDK licenses
on your behalf, so run it yourself). Then `E2E_ANDROID_ARCH=arm64-v8a make mobile-e2e-build-android` and `make mobile-e2e-android`:
`run.sh` starts a dedicated headless emulator (`trackspense-e2e-<id>`, 4 GB / 4 cores) and deletes it afterwards; it only attaches to an
already-running emulator in CI or with `E2E_REUSE_EMULATOR=1`, so your own emulator is never reset. CI uses its own x86_64 emulator.
Verified locally on an arm64 API 35 emulator (13 flows). If adb drops the device, `run_flows.py` reconnects and re-runs the flow once or
twice from a fresh fixture and records it as an infra retry (`infra_retries` in `summary.json`), never as a clean pass.

**Platform-specific flows.** A flow declares `# PLATFORMS: ios` or `# PLATFORMS: android` (default both); a flow outside the run's platform
is reported SKIPPED, never as a pass. `receipt-import` is iOS-only (it asserts the parsed items); `receipt-ocr-native-android` is
Android-only (native ML Kit OCR ran and posted its text once; any upload fallback carries `allow_ai=false`, which the server enforces; ML Kit's reading of the synthetic receipt is
below the server's fallback bar, finding F-015, so it makes no claim about parse quality).

## Regression flows (AC-005)
`flows/regression/`: `lost-save-response` (the server commits an expense but the response is lost: the app must report an unknown
outcome, never resubmit, and leave exactly one expense), `account-switch` (A's expense, unsaved draft and cached group list never reach B),
`deep-link-join` / `deep-link-signed-out` (invite links), `receipt-import` (iOS) and `receipt-ocr-native-android` (on-device OCR ran:
`parse_ocr` posted, image never uploaded), plus `category-picker`, `date-picker`, `insights-scope-select` (sheet accessibility, F-002).

## The fault proxy
The app talks to `fault_proxy.py` on its compiled-in port (18080); the backend sits behind it (18081) and the harness talks to the
backend directly. A flow arms a fault through the control API (`PROXY_CONTROL_URL`, from Maestro's `runScript`), e.g.
`drop_response`: forward and commit, then reset the connection. `seed.py expect-proxy` asserts what the proxy saw.

## How a run works
1. `artifact_evidence.py verify` - the app must match `build-evidence-<platform>.json` (e2e variant, local endpoint, SHA-256).
2. `start-test-backend.sh` - throwaway Postgres cluster + API on `127.0.0.1:18080` (see Safety).
3. `run_flows.py` - for each flow: a fresh verified user and data label, Maestro, then the optional
   `<flow>.verify.py` persisted-data check through the API.

## Safety rules (AC-001 / AC-002)
- The app only talks to a local backend, and only when built as the **e2e variant** (`EXPO_PUBLIC_APP_VARIANT=e2e`).
  Production builds ignore the override; the e2e variant is refused for EAS/push-enabled builds
  (`varavu_selavu_mobile/withE2eVariant.js`) and for any non-local URL (`baseUrl.ts`, `e2e_guard.py`).
- The backend never reads your `.env` or shell secrets: `e2e_guard.py` builds its entire environment from an
  allowlist, `run_test_backend.py` disables `load_dotenv` and runs in an empty directory, the database must be a
  local `trackspense_e2e_*` one, and AI, LLM fallback, mail, push and OCR providers are off.
- Real sign-in is always exercised and the real 5-logins/minute limit stays on. The harness seeds and verifies
  with tokens minted from the per-run JWT secret (it never logs in), and `run_flows.py` paces flows using each
  flow's `# LOGINS: n` header.
- `clearKeychain` wipes the whole iOS simulator keychain: only ever run on the dedicated `trackspense-e2e-*` simulators.

## Writing a flow
- Put it in `flows/smoke/` (the quick set) or `flows/regression/` (the release run includes both). Header comment: scenario ID, journey,
  preconditions, interactions, assertions, cleanup, platforms, `# LOGINS: n`.
- Select by `testID` (`id:`), named `<screen>.<element>`; prefer them over text. The Jest test
  `varavu_selavu_mobile/src/e2eSelectors.test.ts` fails if a flow references an id the app no longer has.
- Every flow must run **alone and in any order** (fresh user, own label, starts from a clean launch). Never depend
  on another flow's data. Share a login only inside a documented partition.
- Financial writes: assert on the server (`.verify.py`), not just the UI. Never auto-retry against mutated state:
  `--retries` re-runs from a fresh user and label and reports the pass as FLAKY.
