#!/usr/bin/env bash
# Tears down what start-test-backend.sh created. Usage: stop-test-backend.sh <state-file>
# The state file is data, not code: values are read with grep (never sourced or executed), the work dir must be a
# ts-e2e-<platform>-<id>.<random> directory directly under the temp root, and a PID is only killed if its command
# line still identifies the E2E backend / this run's Postgres (so a reused PID is left alone).
set -uo pipefail
STATE="${1:?state file required}"
[ -f "${STATE}" ] || { echo "no such state file: ${STATE}" >&2; exit 0; }
get() { grep -m1 "^$1=" "${STATE}" | cut -d= -f2-; }
PID="$(get E2E_BACKEND_PID)"; PROXY_PID="$(get E2E_PROXY_PID)"; WORK="$(get E2E_WORK)"
if [[ "${PID}" =~ ^[0-9]+$ ]] && ps -p "${PID}" -o command= 2>/dev/null | grep -q "varavu_selavu_service.main:app"; then
  kill "${PID}" 2>/dev/null
fi
if [[ "${PROXY_PID}" =~ ^[0-9]+$ ]] && ps -p "${PROXY_PID}" -o command= 2>/dev/null | grep -q "fault_proxy.py --listen"; then
  kill "${PROXY_PID}" 2>/dev/null
fi
TMP_ROOT="${TMPDIR:-/tmp}"; TMP_ROOT="${TMP_ROOT%/}"
if [[ "${WORK}" =~ ^(${TMP_ROOT}|/tmp)/ts-e2e-(ios|android)-[a-z0-9]+\.[A-Za-z0-9]+$ ]] && [ -d "${WORK}" ] && [ ! -L "${WORK}" ]; then
  # Immediate shutdown (SIGQUIT to the postmaster named in the cluster's own pid file), no binary from the state file.
  PMPID="$(head -1 "${WORK}/pg/postmaster.pid" 2>/dev/null)"
  if [[ "${PMPID}" =~ ^[0-9]+$ ]] && ps -p "${PMPID}" -o command= 2>/dev/null | grep -qF "${WORK}/pg"; then
    kill -QUIT "${PMPID}" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "${PMPID}" 2>/dev/null || break; sleep 0.3; done
  fi
  rm -rf "${WORK}"
else
  echo "refusing to delete unexpected work dir: ${WORK:-<empty>}" >&2
fi
rm -f "${STATE}"
