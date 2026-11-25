#!/usr/bin/env bash
# Builds the e2e-variant Android emulator APK (Release, JS embedded) and writes build evidence.
# Output: qa/mobile/.build/artifacts/TrackSpense-android.apk + build-evidence-android.json
# Needs JDK 17 and the Android SDK. Locally both come from qa/mobile/.tools (install-tools.sh, install-android-sdk.sh);
# CI provides its own. E2E_ANDROID_ARCH defaults to the host's emulator architecture (arm64-v8a on Apple silicon, x86_64
# elsewhere). Builds in a clone unless E2E_BUILD_IN_PLACE=1 (CI), like build-ios.sh.
set -euo pipefail
# A multi-minute native build must not be suspended by sleep (see run.sh).
if [ "$(uname -s)" = Darwin ] && [ -z "${E2E_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
  exec env E2E_CAFFEINATED=1 caffeinate -ims "$0" "$@"
fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../../.." && pwd)"
APP_SRC="${ROOT}/varavu_selavu_mobile"
OUT="${ROOT}/qa/mobile/.build/artifacts"
API_URL="${E2E_API_URL_ANDROID:-http://10.0.2.2:${E2E_API_PORT:-18080}}"
# Default to the host's emulator architecture: arm64 images on Apple silicon, x86_64 elsewhere (CI).
if [ -n "${E2E_ANDROID_ARCH:-}" ]; then ARCH="${E2E_ANDROID_ARCH}"
elif [ "$(uname -m)" = arm64 ] || [ "$(uname -m)" = aarch64 ]; then ARCH="arm64-v8a"
else ARCH="x86_64"; fi

python3 "${HERE}/e2e_guard.py" validate-app-url "${API_URL}" >/dev/null   # refuse before any build work
# Local tools: JDK 17 + the SDK installed under qa/mobile/.tools. (CI sets JAVA_HOME / ANDROID_HOME itself.)
if [ -z "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]; then
  TOOLS_ENV="$("${HERE}/install-tools.sh" --env)"; eval "${TOOLS_ENV}"
  SDK_ENV="$("${HERE}/install-android-sdk.sh" --env)"; eval "${SDK_ENV}"
fi
[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ] || { echo "ANDROID_HOME is not set (Android SDK required)" >&2; exit 1; }
mkdir -p "${OUT}"
# In-place mode rewrites ios/ (or android/) and ios/.xcode.env.local inside the real app folder: only for CI runners.
if [ "${E2E_BUILD_IN_PLACE:-0}" = 1 ] && [ "${CI:-}" != "true" ]; then
  echo "E2E_BUILD_IN_PLACE=1 is for CI only (CI=true); locally the build runs in a clone so your own native folders stay untouched" >&2
  exit 1
fi

if [ "${E2E_BUILD_IN_PLACE:-0}" = 1 ]; then
  WORKAPP="${APP_SRC}"
else
  WORKAPP="${ROOT}/qa/mobile/.build/app-android"
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

echo "==> Building e2e variant (Release, ${ARCH}), API ${API_URL}" >&2
cd "${WORKAPP}"
export EXPO_PUBLIC_APP_VARIANT=e2e EXPO_PUBLIC_API_URL="${API_URL}" CI=1
LOG="${ROOT}/qa/mobile/.build/build-android.log"
{ npx expo prebuild --platform android --no-install --clean \
  && (cd android && ./gradlew assembleRelease -PreactNativeArchitectures="${ARCH}" --no-daemon --console=plain); } >"${LOG}" 2>&1 \
  || { tail -40 "${LOG}" >&2; echo "build failed (full log: qa/mobile/.build/build-android.log)" >&2; exit 1; }

BUILT="$(find "${WORKAPP}/android/app/build/outputs/apk/release" -name '*.apk' | head -1)"
[ -n "${BUILT}" ] || { echo "no release APK found" >&2; exit 1; }
cp "${BUILT}" "${OUT}/TrackSpense-android.apk"

# The on-device OCR module must be in the app, or receipts silently fall back to uploading the photo (what happened on iOS).
# Release builds are minified (R8), so class paths do not survive; the module's NAME string ("ReceiptOcr", from its Expo module
# definition) does. Verified against the first real Android build.
found=0
DEXTMP="$(mktemp)"
# Extract to a file, then grep it: `unzip -p | grep -q` under pipefail reports failure when grep exits early (SIGPIPE).
for dex in $(unzip -Z1 "${OUT}/TrackSpense-android.apk" | grep -E '^classes[0-9]*\.dex$'); do
  unzip -p "${OUT}/TrackSpense-android.apk" "${dex}" > "${DEXTMP}"
  if grep -aq "ReceiptOcr" "${DEXTMP}"; then found=1; break; fi
done
rm -f "${DEXTMP}"
[ "${found}" = 1 ] || { echo "the APK does not contain the ReceiptOcr module: the OCR module was not built into the app" >&2; exit 1; }

# Secondary check only (the checksum evidence is the real one): the endpoint must be in the embedded bundle.
# (extract to a file first: `unzip | grep -q` makes unzip die of SIGPIPE, which `set -o pipefail` reports as failure)
BUNDLE_TMP="$(mktemp)"
unzip -p "${OUT}/TrackSpense-android.apk" assets/index.android.bundle >"${BUNDLE_TMP}"
grep -aq "${API_URL}" "${BUNDLE_TMP}" \
  || { rm -f "${BUNDLE_TMP}"; echo "bundle does not contain ${API_URL}; the variant/URL were not compiled in" >&2; exit 1; }
rm -f "${BUNDLE_TMP}"

python3 "${HERE}/artifact_evidence.py" write --artifact "${OUT}/TrackSpense-android.apk" --platform android \
  --api-url "${API_URL}" --out "${OUT}/build-evidence-android.json" >/dev/null
echo "==> Built ${OUT}/TrackSpense-android.apk" >&2
cat "${OUT}/build-evidence-android.json" >&2
