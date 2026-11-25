#!/usr/bin/env bash
# Installs the pinned native-E2E tool chain into qa/mobile/.tools (gitignored) without touching the
# system: Maestro CLI and, on Apple-silicon macOS without a JDK >= 17, a portable Temurin 17.
# Every download is verified against a pinned SHA-256. Usage: eval "$(qa/mobile/scripts/install-tools.sh --env)"
set -euo pipefail

MAESTRO_VERSION="2.12.1"
MAESTRO_URL="https://github.com/mobile-dev-inc/maestro/releases/download/cli-${MAESTRO_VERSION}/maestro.zip"
MAESTRO_SHA256="54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7"

JDK_URL="https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.21.1%2B2/OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.21.1_2.tar.gz"
JDK_SHA256="2a88ccb044a8fb00957be93245da6357c11b55717511509d147cbcc5d93b2109"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="${HERE}/.tools"
MAESTRO_HOME="${TOOLS}/maestro-${MAESTRO_VERSION}"
JDK_HOME_LOCAL="${TOOLS}/jdk-17"

log() { echo "==> $*" >&2; }

verify() { # file sha256
  local got
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] || { echo "checksum mismatch for $1: got $got, want $2" >&2; exit 1; }
}

java_major() { # path to java binary
  "$1" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+)(\.([0-9]+))?.*/\1/;s/^1$/8/'
}

ensure_jdk() {
  if [ -n "${JAVA_HOME:-}" ] && [ -x "${JAVA_HOME}/bin/java" ] && [ "$(java_major "${JAVA_HOME}/bin/java")" -ge 17 ]; then return; fi
  if command -v java >/dev/null 2>&1 && [ "$(java_major "$(command -v java)")" -ge 17 ]; then return; fi
  if [ ! -x "${JDK_HOME_LOCAL}/bin/java" ]; then
    [ "$(uname -s)-$(uname -m)" = "Darwin-arm64" ] || { echo "Install JDK 17+ (no pinned download for this platform)." >&2; exit 1; }
    log "downloading Temurin 17 (portable, into ${JDK_HOME_LOCAL})"
    mkdir -p "${TOOLS}"
    local tgz="${TOOLS}/jdk17.tar.gz"
    curl -fsSL "${JDK_URL}" -o "${tgz}"
    verify "${tgz}" "${JDK_SHA256}"
    rm -rf "${TOOLS}/jdk-extract" && mkdir -p "${TOOLS}/jdk-extract"
    tar -xzf "${tgz}" -C "${TOOLS}/jdk-extract"
    mv "${TOOLS}/jdk-extract"/jdk-*/Contents/Home "${JDK_HOME_LOCAL}"
    rm -rf "${TOOLS}/jdk-extract" "${tgz}"
  fi
}

ensure_maestro() {
  if [ ! -x "${MAESTRO_HOME}/maestro/bin/maestro" ]; then
    log "downloading Maestro ${MAESTRO_VERSION} (into ${MAESTRO_HOME})"
    mkdir -p "${MAESTRO_HOME}"
    local zip="${TOOLS}/maestro.zip"
    curl -fsSL "${MAESTRO_URL}" -o "${zip}"
    verify "${zip}" "${MAESTRO_SHA256}"
    unzip -q -o "${zip}" -d "${MAESTRO_HOME}"
    rm -f "${zip}"
  fi
}

ensure_jdk
ensure_maestro

JAVA_PREFIX=""
[ -x "${JDK_HOME_LOCAL}/bin/java" ] && JAVA_PREFIX="export JAVA_HOME='${JDK_HOME_LOCAL}'; "
if [ "${1:-}" = "--env" ]; then
  echo "${JAVA_PREFIX}export PATH='${MAESTRO_HOME}/maestro/bin':\"\${JAVA_HOME:+\$JAVA_HOME/bin:}\$PATH\"; export MAESTRO_CLI_NO_ANALYTICS=1; export MAESTRO_DRIVER_STARTUP_TIMEOUT=\"\${MAESTRO_DRIVER_STARTUP_TIMEOUT:-180000}\""
else
  log "ready: ${MAESTRO_HOME}/maestro/bin/maestro"
fi
