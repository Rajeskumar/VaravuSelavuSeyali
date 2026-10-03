#!/usr/bin/env bash
# Fast gate for commits to main: runs only the checks for the parts of the repo that are
# staged, so a docs-only commit costs nothing and a backend-only commit skips the TS checks.
#   backend (varavu_selavu_app/) -> make test-backend
#   web     (varavu_selavu_ui/)  -> make typecheck-web
#   mobile  (varavu_selavu_mobile/) -> make typecheck-mobile
# `make release-check` (pytest + audits) runs on push to main instead, and the browser/API QA
# suites gate release tags via GitHub Actions — see scripts/pre-push.sh.
#
# Checks run against the working tree, not just the staged snapshot — unstaged edits in the
# same area can mask or cause a failure. Bypass in an emergency: git commit --no-verify
# (or SKIP_HOOKS=1 git commit ...).
set -euo pipefail

[[ "${SKIP_HOOKS:-}" == "1" ]] && exit 0

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[[ "$branch" == "main" ]] || exit 0

cd "$(git rev-parse --show-toplevel)"
staged="$(git diff --cached --name-only --diff-filter=ACMRD)"
[[ -n "$staged" ]] || exit 0

targets=()
grep -q '^varavu_selavu_app/' <<<"$staged" && targets+=(test-backend)
grep -q '^varavu_selavu_ui/' <<<"$staged" && targets+=(typecheck-web)
grep -q '^varavu_selavu_mobile/' <<<"$staged" && targets+=(typecheck-mobile)

if [[ ${#targets[@]} -eq 0 ]]; then
  exit 0
fi

echo "pre-commit (main): make ${targets[*]}"
if ! make --no-print-directory "${targets[@]}"; then
  echo >&2
  echo "pre-commit: checks failed — commit aborted. Fix them, or bypass with git commit --no-verify." >&2
  exit 1
fi
