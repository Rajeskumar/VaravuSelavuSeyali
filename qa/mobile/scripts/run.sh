#!/usr/bin/env bash
# Runs the native E2E suite on a dedicated simulator/emulator against an isolated backend (TS-QA-103).
#   run.sh --platform ios|android [--suite smoke|regression|all] [--flow NAME] [--shuffle SEED] [--retries N]
#          [--run-id ID] [--keep]
# Needs a build from build-ios.sh / build-android.sh. iOS: creates and deletes its own simulator
# (trackspense-e2e-*). Android: uses the single running emulator (CI starts it).
set -euo pipefail
# Unattended runs must not be suspended by idle/AC sleep: a simulator step that spans a sleep fails hours later
# (seen: one hideKeyboard step recorded 2.7 h). Re-run ourselves under caffeinate on macOS.
if [ "$(uname -s)" = Darwin ] && [ -z "${E2E_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
  exec env E2E_CAFFEINATED=1 caffeinate -ims "$0" "$@"
fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../../.." && pwd)"
ART="${ROOT}/qa/mobile/.build/artifacts"
PLATFORM=""; SUITE="smoke"; FLOW=""; SHUFFLE=""; RETRIES="0"; RUN_ID=""; KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --platform) PLATFORM="${2:-}"; shift 2 ;;
    --suite) SUITE="${2:-}"; shift 2 ;;
    --flow) FLOW="${2:-}"; shift 2 ;;
    --shuffle) SHUFFLE="${2:-}"; shift 2 ;;
    --retries) RETRIES="${2:-}"; shift 2 ;;
    --run-id) RUN_ID="${2:-}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ "${PLATFORM}" = ios ] || [ "${PLATFORM}" = android ] || { echo "--platform ios|android required" >&2; exit 2; }
RUN_ID="${RUN_ID:-$(date +%m%d%H%M%S)$$}"
OUT="${ROOT}/qa/mobile/reports/${PLATFORM}-${RUN_ID}"
mkdir -p "${OUT}"

TOOLS_ENV="$("${HERE}/install-tools.sh" --env)"   # separate step: `eval "$(cmd)"` would hide cmd's failure
eval "${TOOLS_ENV}"

case "${PLATFORM}" in ios) ARTIFACT="${ART}/TrackSpense-ios.app" ;; android) ARTIFACT="${ART}/TrackSpense-android.apk" ;; esac
EVIDENCE="${ART}/build-evidence-${PLATFORM}.json"
echo "==> Verifying build evidence" >&2
python3 "${HERE}/artifact_evidence.py" verify --artifact "${ARTIFACT}" --evidence "${EVIDENCE}" --platform "${PLATFORM}" >"${OUT}/build-evidence.json"

STATE=""; UDID=""; OWN_SIM=0; OWN_EMU=0; PREV_HIDE_ERRORS=""
cleanup() {
  set +e
  [ "${KEEP}" = 1 ] && { echo "kept: state=${STATE} device=${UDID}" >&2; return; }
  [ -n "${STATE}" ] && "${HERE}/stop-test-backend.sh" "${STATE}"
  [ "${OWN_SIM}" = 1 ] && "${HERE}/ios-sim.sh" delete "${UDID}" >/dev/null 2>&1
  [ "${OWN_EMU}" = 1 ] && "${HERE}/android-emu.sh" stop "${RUN_ID}" >/dev/null 2>&1
  # An emulator we did not start (E2E_REUSE_EMULATOR=1, CI): give back its hide_error_dialogs setting.
  if [ "${OWN_EMU}" != 1 ] && [ -n "${PREV_HIDE_ERRORS:-}" ] && [ -n "${UDID}" ]; then
    if [ "${PREV_HIDE_ERRORS}" = null ]; then adb -s "${UDID}" shell settings delete global hide_error_dialogs >/dev/null 2>&1
    else adb -s "${UDID}" shell settings put global hide_error_dialogs "${PREV_HIDE_ERRORS}" >/dev/null 2>&1; fi
  fi
}
trap cleanup EXIT

STATE="$("${HERE}/start-test-backend.sh" --platform "${PLATFORM}" --run-id "${RUN_ID}" | tail -1)"

if [ "${PLATFORM}" = ios ]; then
  UDID="$("${HERE}/ios-sim.sh" create "trackspense-e2e-${RUN_ID}")"; OWN_SIM=1
  xcrun simctl boot "${UDID}"
  xcrun simctl bootstatus "${UDID}" -b >/dev/null
  xcrun simctl install "${UDID}" "${ARTIFACT}"
else
  # Local SDK installed by install-android-sdk.sh (CI has its own SDK on PATH and starts the emulator itself).
  ANDROID_ENV="$("${HERE}/install-android-sdk.sh" --env 2>/dev/null || true)"; eval "${ANDROID_ENV}" 2>/dev/null || true
  command -v adb >/dev/null 2>&1 || { echo "adb not found: install the SDK with install-android-sdk.sh --accept-licenses (or put an SDK on PATH)" >&2; exit 1; }
  # Only attach to an already-running emulator in CI (the runner action started it) or when asked: otherwise this run would
  # install over, and clearState on, a developer's own emulator.
  UDID=""
  if [ "${CI:-}" = "true" ] || [ "${E2E_REUSE_EMULATOR:-0}" = 1 ]; then
    UDID="$(adb devices 2>/dev/null | awk '/emulator-[0-9]+\tdevice/ {print $1}' | head -1 || true)"
  fi
  if [ -z "${UDID}" ]; then
    echo "==> No running emulator: starting a dedicated one (trackspense-e2e-${RUN_ID})" >&2
    # Exit 3 = start refused because the port is already taken (someone else's emulator): nothing of ours exists, so the EXIT trap
    # must NOT run `stop` (it would kill that emulator). Any other failure may have left our own AVD/emulator to clean up.
    if UDID="$("${HERE}/android-emu.sh" start "${RUN_ID}")"; then
      OWN_EMU=1
    else
      rc=$?
      [ "${rc}" = 3 ] || OWN_EMU=1
      exit "${rc}"
    fi
  fi
  # Also on an emulator we did not start (CI's, or E2E_REUSE_EMULATOR=1): a system "isn't responding" dialog stays on top
  # until dismissed and fails every later flow, so never show one (android-emu.sh does the same for its own emulators).
  # (restored by cleanup on an emulator we did not start).
  [ "${OWN_EMU}" = 1 ] || PREV_HIDE_ERRORS="$(adb -s "${UDID}" shell settings get global hide_error_dialogs 2>/dev/null | tr -d '\r' || true)"
  adb -s "${UDID}" shell settings put global hide_error_dialogs 1 >/dev/null 2>&1 || true
  adb -s "${UDID}" install -r "${ARTIFACT}" >/dev/null
fi

ARGS=(--platform "${PLATFORM}" --device "${UDID}" --state "${STATE}" --suite "${SUITE}" --retries "${RETRIES}" --out "${OUT}")
[ -n "${FLOW}" ] && ARGS+=(--flow "${FLOW}")
[ -n "${SHUFFLE}" ] && ARGS+=(--shuffle "${SHUFFLE}")
set +e
python3 "${HERE}/run_flows.py" "${ARGS[@]}"
RC=$?
echo "==> Reports: ${OUT}" >&2
exit ${RC}
