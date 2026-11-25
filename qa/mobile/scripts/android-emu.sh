#!/usr/bin/env bash
# Dedicated Android emulators for the E2E suite (never your own AVDs). Needs the SDK from install-android-sdk.sh
# (eval "$(install-android-sdk.sh --env)") or an SDK on PATH (CI).
#   android-emu.sh start <name>   -> creates AVD trackspense-e2e-<name>, boots it headless, prints its adb serial
#   android-emu.sh stop  <name>   -> kills it and deletes the AVD (only names starting trackspense-e2e-)
set -euo pipefail
cmd="${1:-}"; name="${2:-}"
[ -n "${name}" ] || { echo "usage: android-emu.sh start|stop <name>" >&2; exit 2; }
[[ "${name}" =~ ^[a-z0-9]+$ ]] || { echo "name must be lowercase letters/digits" >&2; exit 2; }
AVD="trackspense-e2e-${name}"
PORT="${E2E_EMULATOR_PORT:-5580}"           # emulator-<PORT> is the adb serial
SERIAL="emulator-${PORT}"
# Image architecture follows the host (the pinned SDK installer fetches the arm64 image on Apple silicon; CI uses its own x86_64 emulator).
if [ -n "${E2E_ANDROID_ARCH:-}" ]; then IMG_ARCH="${E2E_ANDROID_ARCH}"
elif [ "$(uname -m)" = arm64 ] || [ "$(uname -m)" = aarch64 ]; then IMG_ARCH="arm64-v8a"
else IMG_ARCH="x86_64"; fi
IMAGE="system-images;android-35;google_apis;${IMG_ARCH}"
# The emulator log lives in the (gitignored) build folder, not a predictable name in a shared temp dir.
LOG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.build"; mkdir -p "${LOG_DIR}"
LOG="${LOG_DIR}/${AVD}.log"

case "${cmd}" in
  start)
    command -v avdmanager >/dev/null && command -v emulator >/dev/null && command -v adb >/dev/null \
      || { echo "Android SDK tools not on PATH: eval \"\$(install-android-sdk.sh --env)\"" >&2; exit 1; }
    if adb devices 2>/dev/null | grep -q "^${SERIAL}[[:space:]]"; then
      echo "${SERIAL} is already running (a developer emulator?): set E2E_EMULATOR_PORT to a free port; refusing to take it over" >&2; exit 3
    fi
    echo "no" | avdmanager create avd -n "${AVD}" -k "${IMAGE}" -d pixel_6 --force >/dev/null 2>&1 \
      || { echo "could not create AVD ${AVD} (is ${IMAGE} installed?)" >&2; exit 1; }
    # The default pixel_6 profile (2 GB, 2 cores) is thin under software rendering: adb dropped off during the first flows.
    AVD_CFG="${ANDROID_AVD_HOME:-${HOME}/.android/avd}/${AVD}.avd/config.ini"
    if [ -f "${AVD_CFG}" ]; then
      sed -i.bak -e '/^hw\.ramSize=/d' -e '/^hw\.cpu\.ncore=/d' "${AVD_CFG}" && rm -f "${AVD_CFG}.bak"
      printf 'hw.ramSize=4096\nhw.cpu.ncore=4\n' >> "${AVD_CFG}"
    fi
    # Headless, no snapshot, wiped data: every run starts from a clean device. swiftshader keeps it GPU-independent.
    nohup emulator -avd "${AVD}" -port "${PORT}" -no-window -no-audio -no-boot-anim -no-snapshot -wipe-data \
      -gpu swiftshader_indirect >"${LOG}" 2>&1 &
    timeout_s=240; waited=0
    until adb -s "${SERIAL}" get-state 2>/dev/null | grep -q device; do
      sleep 2; waited=$((waited + 2))
      [ "${waited}" -lt "${timeout_s}" ] || { echo "emulator did not appear within ${timeout_s}s (see ${LOG})" >&2; exit 1; }
    done
    for _ in $(seq 1 180); do
      [ "$(adb -s "${SERIAL}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break
      sleep 2
    done
    [ "$(adb -s "${SERIAL}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] || { echo "emulator did not boot in time" >&2; exit 1; }
    # A just-booted emulator can flip adb to `offline` for a moment: require 5 consecutive good round trips.
    ok=0; tries=0
    while [ "${ok}" -lt 5 ] && [ "${tries}" -lt 90 ]; do
      if [ "$(adb -s "${SERIAL}" get-state 2>/dev/null)" = device ] && [ "$(adb -s "${SERIAL}" shell echo ok 2>/dev/null | tr -d '\r')" = ok ]; then
        ok=$((ok + 1))
      else
        ok=0; adb reconnect offline >/dev/null 2>&1 || true
      fi
      tries=$((tries + 1)); sleep 2
    done
    [ "${ok}" -ge 5 ] || { echo "emulator connection never stabilised (see ${LOG})" >&2; exit 1; }
    for s in window_animation_scale transition_animation_scale animator_duration_scale; do adb -s "${SERIAL}" shell settings put global "${s}" 0; done
    # A system "<app> isn't responding" dialog stays on top until dismissed and fails every later flow: never show one.
    adb -s "${SERIAL}" shell settings put global hide_error_dialogs 1
    echo "${SERIAL}" ;;
  stop)
    case "${AVD}" in trackspense-e2e-*) ;; *) echo "refusing to touch AVD ${AVD}" >&2; exit 1 ;; esac
    adb -s "${SERIAL}" emu kill >/dev/null 2>&1 || true
    # Deleting an AVD whose emulator is still shutting down silently leaves it behind: wait for the device to disappear.
    for _ in $(seq 1 20); do adb devices 2>/dev/null | grep -q "^${SERIAL}[[:space:]]" || break; sleep 1; done
    avdmanager delete avd -n "${AVD}" >/dev/null 2>&1 || echo "warning: could not delete AVD ${AVD} (remove it with avdmanager)" >&2 ;;
  *) echo "usage: android-emu.sh start|stop <name>" >&2; exit 2 ;;
esac
