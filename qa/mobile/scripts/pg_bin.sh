# Sourced by start-test-backend.sh: locate the PostgreSQL server binaries (initdb, pg_ctl, createdb, psql).
#
# Debian/Ubuntu keep them in a versioned directory that is NOT on PATH (/usr/lib/postgresql/<major>/bin), and the major
# changes with the runner image (16 on ubuntu-24.04, 18 on ubuntu-26.04). A hard-coded list of majors broke the first CI run
# ("PostgreSQL server binaries not found"), so scan the versioned directories newest first instead.
#
# Order: E2E_PG_BIN (explicit) > a pg_ctl on PATH > /usr/lib/postgresql/<newest>/bin ... > Homebrew locations.
# Overrides for tests: E2E_PG_LIB_ROOT (default /usr/lib/postgresql), E2E_PG_EXTRA_DIRS (default: Homebrew; set empty to disable).
find_pg_bin() {
  if [ -n "${E2E_PG_BIN:-}" ]; then echo "${E2E_PG_BIN}"; return; fi
  local root="${E2E_PG_LIB_ROOT:-/usr/lib/postgresql}" c major
  local candidates=()
  c="$(command -v pg_ctl 2>/dev/null || true)"
  [ -n "${c}" ] && candidates+=("$(dirname "${c}")")
  if [ -d "${root}" ]; then
    # numeric, newest first: "18" > "16" > "9.6" (a plain/alphabetical sort would put 9.6 first)
    while IFS= read -r major; do
      [ -n "${major}" ] && candidates+=("${root}/${major}/bin")
    done < <(ls -1 "${root}" 2>/dev/null | sort -rn)
  fi
  for c in ${E2E_PG_EXTRA_DIRS-/opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@15/bin /usr/local/opt/postgresql@16/bin}; do
    candidates+=("${c}")
  done
  for c in "${candidates[@]}"; do
    [ -x "${c}/initdb" ] && { echo "${c}"; return; }
  done
  echo "PostgreSQL server binaries not found (looked on PATH, in ${root}/<version>/bin and the Homebrew locations; set E2E_PG_BIN)" >&2
  return 1
}
