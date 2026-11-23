#!/usr/bin/env bash
# Push gate.
#   main         -> `make release-check` (backend pytest + dependency audits; no servers needed).
#   release-* tag -> require unit, QA and framework workflows on the tagged commit. A release tag IS the deploy (Cloud Build
#                    fires on it), and tags are often pushed by hand, so this is the gate that
#                    the browser/API QA suites ran green before anything ships.
#
# Bypass in an emergency: git push --no-verify (or SKIP_HOOKS=1 git push ...).
set -euo pipefail

[[ "${SKIP_HOOKS:-}" == "1" ]] && exit 0

cd "$(git rev-parse --show-toplevel)"

pushes_main=false
release_shas=()

# git feeds one line per ref being pushed: <local ref> <local sha> <remote ref> <remote sha>
while read -r _local_ref local_sha remote_ref _remote_sha; do
  # Deleting a ref pushes the all-zero sha; nothing to check.
  [[ "$local_sha" =~ ^0+$ ]] && continue
  case "$remote_ref" in
    refs/heads/main) pushes_main=true ;;
    refs/tags/release-*) release_shas+=("${remote_ref#refs/tags/} $local_sha") ;;
  esac
done

# Server-side Cloud Build repeats this exact-commit check; hooks are convenience only.
check_release_tag() {
  local tag="$1" sha
  sha="$(git rev-parse "$2^{commit}")"
  echo "pre-push ($tag): checking unit, QA and framework CI on $sha"
  python3 scripts/quality/release-gate.py --sha "$sha"
}

failed=false
for entry in ${release_shas[@]+"${release_shas[@]}"}; do
  check_release_tag ${entry} || failed=true
done
if $failed; then
  echo "Release tag push aborted. Bypass (emergencies only): git push --no-verify" >&2
  exit 1
fi

if $pushes_main; then
  echo "pre-push (main): make release-check"
  if ! make --no-print-directory release-check; then
    echo >&2
    echo "pre-push: release-check failed — push aborted. Bypass with git push --no-verify." >&2
    exit 1
  fi
fi
