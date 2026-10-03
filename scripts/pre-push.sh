#!/usr/bin/env bash
# Full gate before anything reaches origin/main: `make release-check` (backend pytest,
# dependency audits, and the qa/ Playwright smoke+regression+api suites).
#
# The qa/ suites need the local stack up first — backend, web, and the QA database
# (see qa/README.md: `make qa-db-bootstrap`, then start the backend and web app).
# Bypass in an emergency: git push --no-verify (or SKIP_HOOKS=1 git push ...).
set -euo pipefail

[[ "${SKIP_HOOKS:-}" == "1" ]] && exit 0

pushes_main=false
# git feeds one line per ref being pushed: <local ref> <local sha> <remote ref> <remote sha>
while read -r _local_ref local_sha remote_ref _remote_sha; do
  # Deleting a ref pushes the all-zero sha; nothing to check.
  if [[ "$remote_ref" == "refs/heads/main" && ! "$local_sha" =~ ^0+$ ]]; then
    pushes_main=true
  fi
done
$pushes_main || exit 0

cd "$(git rev-parse --show-toplevel)"
echo "pre-push (main): make release-check"
if ! make --no-print-directory release-check; then
  echo >&2
  echo "pre-push: release-check failed — push aborted." >&2
  echo "If the qa/ suites failed to connect, start the local stack first (qa/README.md)." >&2
  echo "Bypass with git push --no-verify." >&2
  exit 1
fi
