#!/usr/bin/env bash
# Push gate.
#   main         -> `make release-check` (backend pytest + dependency audits; no servers needed).
#   release-* tag -> refuse unless GitHub Actions' QA workflow (.github/workflows/qa.yml)
#                    passed on the tagged commit. A release tag IS the deploy (Cloud Build
#                    fires on it), and tags are often pushed by hand, so this is the gate that
#                    the browser/API QA suites ran green before anything ships.
#
# Bypass in an emergency: git push --no-verify (or SKIP_HOOKS=1 git push ...).
set -euo pipefail

[[ "${SKIP_HOOKS:-}" == "1" ]] && exit 0

cd "$(git rev-parse --show-toplevel)"

QA_WORKFLOW="qa.yml"
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

# The commit whose QA run counts for $1: qa.yml ignores mobile-, docs- and markdown-only
# changes (paths-ignore), so a commit touching only those has no run of its own. Walk back to
# the newest commit that did touch QA-relevant paths.
qa_relevant_commit() {
  git log -1 --format=%H "$1" -- . \
    ':(exclude)varavu_selavu_mobile' ':(exclude)docs' ':(glob,exclude)**/*.md'
}

check_release_tag() {
  local tag="$1" sha commit runs verdict
  # An annotated tag pushes the tag object's sha; peel it to the commit.
  sha="$(git rev-parse "$2^{commit}")"
  commit="$(qa_relevant_commit "$sha")"
  if [[ -z "$commit" ]]; then
    echo "pre-push ($tag): no QA-relevant commit found at or before ${sha:0:8}." >&2
    return 1
  fi

  if ! command -v gh >/dev/null 2>&1; then
    echo "pre-push ($tag): the GitHub CLI (gh) is needed to confirm CI passed. Install it and run 'gh auth login'." >&2
    return 1
  fi
  if ! runs="$(gh run list --workflow "$QA_WORKFLOW" --commit "$commit" --limit 20 \
        --json status,conclusion,url 2>&1)"; then
    echo "pre-push ($tag): couldn't query GitHub Actions: $runs" >&2
    return 1
  fi

  # Newest run decides: success / in progress / failed / none.
  verdict="$(python3 -c '
import json, sys
runs = json.loads(sys.argv[1])
if not runs:
    print("none -"); sys.exit()
r = runs[0]
if r["status"] != "completed":
    print("pending " + r["url"])
elif r["conclusion"] == "success":
    print("success " + r["url"])
else:
    print("failure " + r["url"] + " " + str(r["conclusion"]))
' "$runs")"

  local where="QA run for ${commit:0:8}"
  [[ "$commit" != "$sha" ]] && where+=" (newest QA-relevant commit before ${sha:0:8})"
  case "${verdict%% *}" in
    success)
      echo "pre-push ($tag): CI passed — $where: ${verdict#success }"
      return 0 ;;
    pending)
      echo "pre-push ($tag): CI is still running — $where: ${verdict#pending }" >&2
      echo "Wait for it to finish, then push the tag again." >&2 ;;
    failure)
      echo "pre-push ($tag): CI failed — $where: ${verdict#failure }" >&2
      echo "Fix it on main first; the tag is the deploy." >&2 ;;
    *)
      echo "pre-push ($tag): no CI run found for ${commit:0:8}. Push main first so GitHub Actions runs on it." >&2 ;;
  esac
  return 1
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
