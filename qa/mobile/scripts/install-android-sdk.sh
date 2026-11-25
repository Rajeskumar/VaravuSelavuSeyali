#!/usr/bin/env bash
# Installs a pinned Android SDK + emulator image into qa/mobile/.tools/android-sdk (gitignored; nothing is installed system-wide).
# macOS Apple silicon only: Linux CI runners ship an Android SDK (see mobile-e2e.yml).
#
#   install-android-sdk.sh --accept-licenses      # first time: accepts Google's Android SDK licenses on your behalf
#   eval "$(install-android-sdk.sh --env)"        # exports ANDROID_HOME / ANDROID_SDK_ROOT / ANDROID_AVD_HOME / PATH
#
# Versions match React Native 0.86 / Expo SDK 57 (compileSdk 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1).
set -euo pipefail

CMDLINE_URL="https://dl.google.com/android/repository/commandlinetools-mac_arm64-16111833_latest.zip"
CMDLINE_SHA1="ad03dc49bfacfd52c110b14104ea548b8a07e830"   # published by Google in repository2-3.xml
PACKAGES=(
  "platform-tools"
  "emulator"
  "platforms;android-36"
  "build-tools;36.0.0"
  "ndk;27.1.12297006"
  "cmake;3.22.1"
  "system-images;android-35;google_apis;arm64-v8a"
)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK="${HERE}/.tools/android-sdk"
AVD="${HERE}/.tools/avd"

env_exports() {
  # ANDROID_USER_HOME keeps adb keys and caches out of ~/.android; AVDs live under the tools folder too.
  echo "export ANDROID_HOME='${SDK}'; export ANDROID_SDK_ROOT='${SDK}'; export ANDROID_AVD_HOME='${AVD}'; export ANDROID_USER_HOME='${HERE}/.tools/android-user'; mkdir -p '${HERE}/.tools/android-user'; export PATH='${SDK}/cmdline-tools/latest/bin':'${SDK}/platform-tools':'${SDK}/emulator':\"\$PATH\""
}
if [ "${1:-}" = "--env" ]; then
  [ -x "${SDK}/platform-tools/adb" ] || { echo "echo 'Android SDK not installed: run install-android-sdk.sh --accept-licenses' >&2; false"; exit 0; }
  env_exports; exit 0
fi

[ "$(uname -s)-$(uname -m)" = "Darwin-arm64" ] || { echo "Apple-silicon macOS only (CI runners already have an Android SDK)" >&2; exit 1; }
ACCEPT=0; [ "${1:-}" = "--accept-licenses" ] && ACCEPT=1

TOOLS_ENV="$("${HERE}/scripts/install-tools.sh" --env)"; eval "${TOOLS_ENV}"   # JDK 17 for sdkmanager

if [ ! -x "${SDK}/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "==> downloading Android command-line tools" >&2
  mkdir -p "${SDK}/cmdline-tools" "${AVD}"
  zip="${HERE}/.tools/cmdline-tools.zip"
  curl -fsSL "${CMDLINE_URL}" -o "${zip}"
  got="$(shasum -a 1 "${zip}" | awk '{print $1}')"
  [ "${got}" = "${CMDLINE_SHA1}" ] || { echo "checksum mismatch for command-line tools: got ${got}" >&2; exit 1; }
  rm -rf "${SDK}/cmdline-tools/latest" "${HERE}/.tools/cmdline-extract"
  mkdir -p "${HERE}/.tools/cmdline-extract" && unzip -q "${zip}" -d "${HERE}/.tools/cmdline-extract"
  mv "${HERE}/.tools/cmdline-extract/cmdline-tools" "${SDK}/cmdline-tools/latest"
  rm -rf "${HERE}/.tools/cmdline-extract" "${zip}"
fi

SDKM="${SDK}/cmdline-tools/latest/bin/sdkmanager"
if [ "${ACCEPT}" = 1 ]; then
  echo "==> accepting Android SDK licenses (--accept-licenses)" >&2
  yes | "${SDKM}" --sdk_root="${SDK}" --licenses >/dev/null 2>&1 || true
fi
echo "==> installing ${#PACKAGES[@]} packages (several GB the first time)" >&2
"${SDKM}" --sdk_root="${SDK}" "${PACKAGES[@]}" >&2
echo "==> ready: ${SDK}" >&2
