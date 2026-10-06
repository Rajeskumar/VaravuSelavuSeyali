#!/usr/bin/env bash
# Area-aware deterministic verification. Runs only the checks for the areas that changed
# (same idea as scripts/pre-commit.sh). Existing make targets are the source of truth.
#   scripts/quality/verify.sh            fast: changed areas, unit-level checks
#   scripts/quality/verify.sh --full     everything: `make unit-check` + `make release-check`
#   scripts/quality/verify.sh --build    also production-build the web app
#   scripts/quality/verify.sh --all-areas  ignore the diff, check every area
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

full=0; build=0; all=0
for a in "$@"; do case "$a" in --full) full=1;; --build) build=1;; --all-areas) all=1;; esac; done

if (( full )); then
  make unit-check && make release-check
  rc=$?
else
  base=origin/main; git rev-parse --verify -q "$base" >/dev/null || base=main
  mb="$(git merge-base "$base" HEAD 2>/dev/null || echo HEAD)"
  files="$( { git diff --name-only "$mb" HEAD; git diff --name-only; git diff --name-only --cached; git ls-files --others --exclude-standard; } | sort -u)"
  targets=()
  if (( all )) || grep -q '^varavu_selavu_app/' <<<"$files"; then targets+=(test-backend); fi
  if (( all )) || grep -q '^varavu_selavu_ui/' <<<"$files"; then targets+=(lint-web typecheck-web test-web); fi
  if (( all )) || grep -q '^varavu_selavu_mobile/' <<<"$files"; then targets+=(typecheck-mobile test-mobile); fi
  if [[ ${#targets[@]} -eq 0 ]]; then echo "verify: no code areas changed — nothing to run."; rc=0
  else echo "verify: make ${targets[*]}"; make --no-print-directory "${targets[@]}"; rc=$?; fi
fi

if (( build )) && (( rc == 0 )); then
  echo "verify: web production build"; (cd varavu_selavu_ui && CI=true npm run build); rc=$?
fi
(( rc == 0 )) && echo "verify: OK" || echo "verify: FAILED" >&2
exit $rc
