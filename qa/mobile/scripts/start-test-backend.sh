#!/usr/bin/env bash
# Starts an isolated backend for one native-E2E run: a throwaway Postgres cluster + the API on
# 127.0.0.1, under the isolation contract in e2e_guard.py (TS-QA-103, AC-002). Writes a state file that
# run.sh/seed read and stop-test-backend.sh tears down.
#
#   start-test-backend.sh --platform ios|android [--run-id ID]
#
# Never uses the developer's .env, shell secrets, Docker, or any existing database.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../../.." && pwd)"
GUARD="${HERE}/e2e_guard.py"
PLATFORM=""; RUN_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --platform) PLATFORM="${2:-}"; shift 2 ;;
    --run-id) RUN_ID="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ "${PLATFORM}" = "ios" ] || [ "${PLATFORM}" = "android" ] || { echo "--platform ios|android required" >&2; exit 2; }
RUN_ID="${RUN_ID:-$(date +%m%d%H%M%S)$$}"
case "${RUN_ID}" in *[!a-z0-9]*|"") echo "--run-id must be lowercase letters/digits" >&2; exit 2 ;; esac

DB_NAME="trackspense_e2e_${PLATFORM}_${RUN_ID}"
TMP_ROOT="${TMPDIR:-/tmp}"; TMP_ROOT="${TMP_ROOT%/}"
WORK=""                                                    # created privately (mktemp -d, mode 0700) below
API_PID=""; PROXY_PID=""
STATE_DIR="${ROOT}/qa/mobile/.build"
STATE="${STATE_DIR}/state-${PLATFORM}-${RUN_ID}.env"
mkdir -p "${STATE_DIR}"

free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'; }

find_pg_bin() {
  if [ -n "${E2E_PG_BIN:-}" ]; then echo "${E2E_PG_BIN}"; return; fi
  local c
  for c in "$(command -v pg_ctl 2>/dev/null | xargs -I{} dirname {} 2>/dev/null || true)" \
           /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@15/bin /usr/local/opt/postgresql@16/bin \
           /usr/lib/postgresql/16/bin /usr/lib/postgresql/15/bin /usr/lib/postgresql/14/bin; do
    [ -n "${c}" ] && [ -x "${c}/initdb" ] && { echo "${c}"; return; }
  done
  echo "PostgreSQL server binaries not found (set E2E_PG_BIN)" >&2; return 1
}

cleanup_on_error() {
  if [ "${E2E_KEEP_ON_ERROR:-0}" = 1 ]; then echo "start-test-backend failed; kept ${WORK:-<none>} for inspection" >&2; return; fi
  echo "start-test-backend failed; tearing down" >&2
  # The state file is not written yet, so stop-test-backend.sh cannot do this. `|| true`: under errexit (we are inside an ERR
  # trap) a kill of an already-dead child would end the trap here and skip the Postgres stop and the rm below.
  { [ -n "${API_PID}" ] && kill "${API_PID}" 2>/dev/null; } || true
  { [ -n "${PROXY_PID}" ] && kill "${PROXY_PID}" 2>/dev/null; } || true
  [ -f "${STATE}" ] && "${HERE}/stop-test-backend.sh" "${STATE}" || true
  if [ -n "${WORK}" ] && [ -d "${WORK}" ]; then
    # errexit is active inside this ERR trap: a failing pg_ctl (no cluster yet) must not skip the rm below.
    { [ -n "${PG_BIN:-}" ] && "${PG_BIN}/pg_ctl" -D "${WORK}/pg" -m immediate stop >/dev/null 2>&1; } || true
    rm -rf "${WORK}"
  fi
  true
}
trap cleanup_on_error ERR
# Ctrl-C / kill during the ~60 s of initdb, bootstrap and health waits must not leave a Postgres, API and proxy behind
# (no state file exists yet for stop-test-backend.sh to find them by).
trap 'cleanup_on_error; exit 130' INT TERM

# Per-run signing secret. The harness (seed.py) mints tokens with it to seed/verify data without spending the
# login rate limit; the app under test always signs in for real.
JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
export E2E_JWT_SECRET="${JWT_SECRET}"
PG_BIN="$(find_pg_bin)"
# The API port is compiled into the app under test (build-*.sh), so it is fixed per build, not random. The app talks
# to the fault proxy on that port; the backend sits behind it on its own port, and the harness talks to the backend
# directly so its seeding and verification never meet an injected fault.
API_PORT="${E2E_API_PORT:-18080}"; BACKEND_PORT="${E2E_BACKEND_PORT:-18081}"; CONTROL_PORT="${E2E_CONTROL_PORT:-18082}"
for p in "${API_PORT}" "${BACKEND_PORT}" "${CONTROL_PORT}"; do
  python3 -c 'import socket,sys; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("127.0.0.1",int(sys.argv[1])))' "${p}" 2>/dev/null \
    || { echo "port ${p} is busy (another E2E backend running? stop it with stop-test-backend.sh)" >&2; exit 1; }
done
PG_PORT="$(free_port)"
# The throwaway cluster is password-protected (scram), not `trust`: on a shared host another local user must not
# be able to connect to it, and a predictable /tmp path must not be pre-creatable by someone else.
PG_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
DB_URL="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${DB_NAME}"
export E2E_DATABASE_URL="${DB_URL}"                            # passed to children by environment, never on argv
python3 "${GUARD}" validate-db-env >/dev/null                  # refuses before creating anything
APP_URL="$(python3 "${GUARD}" api-url "${PLATFORM}" "${API_PORT}")"

WORK="$(umask 077; mktemp -d "${TMP_ROOT}/ts-e2e-${PLATFORM}-${RUN_ID}.XXXXXX")"   # unique, owned by us, mode 0700
mkdir -p "${WORK}/empty"
export PGPASSWORD="${PG_PASSWORD}"
echo "==> Postgres cluster for ${DB_NAME} on 127.0.0.1:${PG_PORT}" >&2
( umask 077; printf '%s' "${PG_PASSWORD}" >"${WORK}/pgpw" )
"${PG_BIN}/initdb" -D "${WORK}/pg" -U postgres -A scram-sha-256 --pwfile="${WORK}/pgpw" -E UTF8 --no-sync >/dev/null
rm -f "${WORK}/pgpw"
"${PG_BIN}/pg_ctl" -D "${WORK}/pg" -l "${WORK}/pg.log" -w \
  -o "-p ${PG_PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${WORK} -c unix_socket_permissions=0700 -c fsync=off" start >/dev/null
"${PG_BIN}/createdb" -h 127.0.0.1 -p "${PG_PORT}" -U postgres "${DB_NAME}"
"${PG_BIN}/psql" -h 127.0.0.1 -p "${PG_PORT}" -U postgres -d "${DB_NAME}" -v ON_ERROR_STOP=1 -q \
  -c "CREATE SCHEMA IF NOT EXISTS trackspense;" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

echo "==> Bootstrapping schema" >&2
python3 "${HERE}/run_test_backend.py" bootstrap --cwd "${WORK}/empty" >"${WORK}/bootstrap.log" 2>&1 \
  || { tail -20 "${WORK}/bootstrap.log" >&2; false; }

echo "==> Starting API on 127.0.0.1:${BACKEND_PORT}, fault proxy on ${API_PORT} (control ${CONTROL_PORT})" >&2
nohup python3 "${HERE}/run_test_backend.py" serve --port "${BACKEND_PORT}" --cwd "${WORK}/empty" \
  >"${WORK}/backend.log" 2>&1 &
API_PID=$!
ok=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/v1/healthz" >/dev/null 2>&1; then ok=1; break; fi
  kill -0 "${API_PID}" 2>/dev/null || { tail -30 "${WORK}/backend.log" >&2; echo "backend exited" >&2; false; }
  sleep 1
done
[ "${ok}" = 1 ] || { tail -30 "${WORK}/backend.log" >&2; echo "backend never became healthy" >&2; false; }
nohup python3 "${HERE}/fault_proxy.py" --listen "${API_PORT}" --backend "${BACKEND_PORT}" --control "${CONTROL_PORT}" \
  --log "${WORK}/proxy.log" >"${WORK}/proxy.out" 2>&1 &
PROXY_PID=$!
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/api/v1/healthz" >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:${CONTROL_PORT}/healthz" >/dev/null 2>&1; then ok=1; break; fi
  kill -0 "${PROXY_PID}" 2>/dev/null || { tail -20 "${WORK}/proxy.out" >&2; echo "fault proxy exited" >&2; false; }
  sleep 1
done
[ "${ok}" = 1 ] || { tail -20 "${WORK}/proxy.out" >&2; echo "fault proxy never became healthy" >&2; false; }

umask 077
{
  echo "E2E_PLATFORM=${PLATFORM}"
  echo "E2E_RUN_ID=${RUN_ID}"
  echo "E2E_DATABASE_URL=${DB_URL}"
  echo "E2E_API_PORT=${API_PORT}"
  echo "E2E_BACKEND_PORT=${BACKEND_PORT}"
  echo "E2E_API_URL=${APP_URL}"
  echo "E2E_API_HOST_URL=http://127.0.0.1:${BACKEND_PORT}"
  echo "E2E_PROXY_CONTROL_URL=http://127.0.0.1:${CONTROL_PORT}"
  echo "E2E_BACKEND_PID=${API_PID}"
  echo "E2E_PROXY_PID=${PROXY_PID}"
  echo "E2E_JWT_SECRET=${JWT_SECRET}"
  echo "E2E_PG_BIN=${PG_BIN}"
  echo "E2E_WORK=${WORK}"
} >"${STATE}"
trap - ERR INT TERM
unset PGPASSWORD
echo "${STATE}"
