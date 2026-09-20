#!/usr/bin/env bash
# Tag and push a production release. The tag IS the deploy: pushing release-vX.Y.Z fires the
# backend and frontend Cloud Build triggers (see .cloudbuild/README.md).
#
#   scripts/release.sh 1.4.0
set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: $0 <MAJOR.MINOR.PATCH>   e.g. $0 1.4.0" >&2
  exit 2
fi
TAG="release-v${VERSION}"

cd "$(git rev-parse --show-toplevel)"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "Releases are cut from main; you are on '$branch'." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Working tree has uncommitted changes — commit or stash them first." >&2
  exit 1
fi

git fetch --quiet origin main --tags
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "Local main is not identical to origin/main — pull/push first so the tag matches what CI sees." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "Tag ${TAG} already exists." >&2
  exit 1
fi

last="$(git tag --list 'release-v*' --sort=-v:refname | head -n1 || true)"
echo "Commit to release : $(git log -1 --format='%h %s')"
echo "Previous release  : ${last:-<none>}"
if [[ -n "$last" ]]; then
  echo "Changes since ${last}:"
  git diff --stat "$last"..HEAD | tail -n 15
fi
echo
read -r -p "Tag and push ${TAG} to PRODUCTION? [y/N] " answer
[[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Aborted."; exit 1; }

git tag -a "$TAG" -m "Release ${VERSION}"
git push origin "$TAG"
echo "Pushed ${TAG}. Builds: https://console.cloud.google.com/cloud-build/builds?project=gold-circlet-424313-r7"
