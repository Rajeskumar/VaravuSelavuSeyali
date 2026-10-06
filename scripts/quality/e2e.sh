#!/usr/bin/env bash
# Thin wrapper over the existing Playwright make targets, with the rate-limit reminder.
#   scripts/quality/e2e.sh smoke|regression|api|all
# The qa suite spends the real auth rate limits (5 logins/min, 5 registrations/hour per backend
# process): restart the local backend between full runs; never add real logins to qa tests.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
case "${1:-smoke}" in
  smoke)      make qa-smoke ;;
  regression) make qa-regression ;;
  api)        make qa-api ;;
  all)        make qa-all ;;
  *) echo "usage: e2e.sh smoke|regression|api|all" >&2; exit 2 ;;
esac
