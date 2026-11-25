#!/usr/bin/env bash
# Builds the e2e-variant iOS simulator app (Release, JS embedded) and writes build evidence.
#   build-ios.sh [--udid UDID]     (default: creates a throwaway simulator for the build and deletes it)
# Output: qa/mobile/.build/artifacts/TrackSpense-ios.app + build-evidence-ios.json
# Runs in a clone of varavu_selavu_mobile (E2E_BUILD_IN_PLACE=1 to build in place, as CI does), so the
# developer's own ios/ and android/ folders are never regenerated.
set -euo pipefail
# Unattended runs must not be suspended by idle/AC sleep: a simulator step that spans a sleep fails hours later
# (seen: one hideKeyboard step recorded 2.7 h). Re-run ourselves under caffeinate on macOS.
if [ "$(uname -s)" = Darwin ] && [ -z "${E2E_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
  exec env E2E_CAFFEINATED=1 caffeinate -ims "$0" "$@"
fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../../.." && pwd)"
APP_SRC="${ROOT}/varavu_selavu_mobile"
OUT="${ROOT}/qa/mobile/.build/artifacts"
API_URL="${E2E_API_URL_IOS:-http://localhost:${E2E_API_PORT:-18080}}"
UDID=""
while [ $# -gt 0 ]; do case "$1" in --udid) UDID="${2:-}"; shift 2 ;; *) echo "unknown argument: $1" >&2; exit 2 ;; esac; done

python3 "${HERE}/e2e_guard.py" validate-app-url "${API_URL}" >/dev/null   # refuse before any build work
mkdir -p "${OUT}"
# In-place mode rewrites ios/ (or android/) and ios/.xcode.env.local inside the real app folder: only for CI runners.
if [ "${E2E_BUILD_IN_PLACE:-0}" = 1 ] && [ "${CI:-}" != "true" ]; then
  echo "E2E_BUILD_IN_PLACE=1 is for CI only (CI=true); locally the build runs in a clone so your own native folders stay untouched" >&2
  exit 1
fi

if [ "${E2E_BUILD_IN_PLACE:-0}" = 1 ]; then
  WORKAPP="${APP_SRC}"
else
  WORKAPP="${ROOT}/qa/mobile/.build/app-ios"
  echo "==> Cloning app into ${WORKAPP}" >&2
  mkdir -p "${WORKAPP}"
  # Anchored excludes (leading /): an unanchored `--exclude ios` also stripped modules/receipt-ocr/ios (and /android) from the
  # clone, so the e2e app silently shipped WITHOUT the on-device OCR module and fell back to uploading receipt images.
  rsync -a --delete --exclude /ios --exclude /android --exclude /.expo --exclude /node_modules "${APP_SRC}/" "${WORKAPP}/"
  for d in ios android; do
    [ -d "${WORKAPP}/modules/receipt-ocr/${d}" ] || { echo "clone is missing modules/receipt-ocr/${d}: the OCR module would not be built" >&2; exit 1; }
  done
  if [ ! -e "${WORKAPP}/node_modules" ]; then
    if [ "$(uname -s)" = Darwin ]; then cp -cR "${APP_SRC}/node_modules" "${WORKAPP}/node_modules"; else cp -R "${APP_SRC}/node_modules" "${WORKAPP}/node_modules"; fi
  fi
fi

OWN_SIM=0
if [ -z "${UDID}" ]; then
  UDID="$("${HERE}/ios-sim.sh" create "trackspense-e2e-build-$$")"; OWN_SIM=1
  trap '[ "${OWN_SIM}" = 1 ] && "${HERE}/ios-sim.sh" delete "${UDID}" >/dev/null 2>&1 || true' EXIT
fi

echo "==> Building e2e variant (Release) for ${UDID}, API ${API_URL}" >&2
cd "${WORKAPP}"
# The variant + URL are read twice: by the config plugin at prebuild (guards, cleartext) and compiled into
# the JS bundle by Metro during the Release build. LANG is required by CocoaPods.
export EXPO_PUBLIC_APP_VARIANT=e2e EXPO_PUBLIC_API_URL="${API_URL}" LANG=en_US.UTF-8 CI=1
# Create the iOS project (and install pods) first. `pod install` rewrites ios/.xcode.env.local, so the variables
# must be written AFTER it and the build must not install again (--no-install below).
[ -d ios ] || npx expo prebuild --platform ios >"${ROOT}/qa/mobile/.build/prebuild-ios.log" 2>&1 \
  || { tail -30 "${ROOT}/qa/mobile/.build/prebuild-ios.log" >&2; echo "prebuild failed" >&2; exit 1; }
# Xcode's "Bundle React Native code and images" phase does NOT inherit this shell's environment, so Metro would
# silently dead-code the e2e branch. The phase sources ios/.xcode.env.local: hand the variables over there.
XENV="ios/.xcode.env.local"; touch "${XENV}"
sed -i '' '/^# >>> e2e variant (build-ios.sh)/,/^# <<< e2e variant/d' "${XENV}"
{
  echo "# >>> e2e variant (build-ios.sh)"
  echo "export EXPO_PUBLIC_APP_VARIANT=e2e"
  echo "export EXPO_PUBLIC_API_URL='${API_URL}'"
  echo "# <<< e2e variant"
} >>"${XENV}"
npx expo run:ios --no-install --configuration Release --no-bundler --device "${UDID}" >"${ROOT}/qa/mobile/.build/build-ios.log" 2>&1 \
  || { tail -40 "${ROOT}/qa/mobile/.build/build-ios.log" >&2; echo "build failed (full log: qa/mobile/.build/build-ios.log)" >&2; exit 1; }

# `expo run:ios` builds into Xcode's DerivedData and logs "Installing <path>.app": take the path from there.
BUILT="$(sed -n 's/^.*Installing \(.*\.app\)[[:space:]]*$/\1/p' "${ROOT}/qa/mobile/.build/build-ios.log" | tail -1)"
case "${BUILT}" in */Release-iphonesimulator/*.app) ;; *) BUILT="" ;; esac
[ -n "${BUILT}" ] && [ -d "${BUILT}" ] || { echo "could not find the Release-iphonesimulator .app (see qa/mobile/.build/build-ios.log)" >&2; exit 1; }
rm -rf "${OUT}/TrackSpense-ios.app"; cp -R "${BUILT}" "${OUT}/TrackSpense-ios.app"

# The on-device OCR module must be linked, or receipts silently fall back to uploading the photo.
grep -q "ReceiptOcr" "${WORKAPP}/ios/Podfile.lock" \
  || { echo "ReceiptOcr is not in ios/Podfile.lock: the OCR module was not linked into the app (a stale clone? delete ${WORKAPP}/ios and rebuild)" >&2; exit 1; }

# Secondary check only (the checksum evidence is the real one): the endpoint must be in the bundle.
grep -aq "${API_URL}" "${OUT}/TrackSpense-ios.app/main.jsbundle" \
  || { echo "bundle does not contain ${API_URL}; the variant/URL were not compiled in" >&2; exit 1; }

python3 "${HERE}/artifact_evidence.py" write --artifact "${OUT}/TrackSpense-ios.app" --platform ios \
  --api-url "${API_URL}" --out "${OUT}/build-evidence-ios.json" >/dev/null
echo "==> Built ${OUT}/TrackSpense-ios.app" >&2
cat "${OUT}/build-evidence-ios.json" >&2
