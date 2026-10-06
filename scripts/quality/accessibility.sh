#!/usr/bin/env bash
# Deterministic accessibility evidence for the web app.
#   1. eslint (CRA's react-app config includes jsx-a11y rules)  2. a11y-relevant Jest tests
#   3. optional axe-core scan of a running app:  scripts/quality/accessibility.sh --axe [base-url]
# Axe cannot judge focus order, announcements or meaning — those need code/ARIA inspection or a
# real screen-reader pass (VoiceOver/NVDA); the review skill reports them as Suspected.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
rc=0
echo "== eslint (jsx-a11y)"; (cd varavu_selavu_ui && npx eslint src --ext .ts,.tsx) || rc=1
echo "== a11y-relevant Jest tests"
(cd varavu_selavu_ui && CI=true npx react-scripts test --watchAll=false RouteA11y SegmentedTabs PasswordField QuickCaptureSheet ExpenseFeed 2>&1 | tail -8) || rc=1
if [[ "${1:-}" == "--axe" ]]; then
  echo "== axe scan"; node scripts/quality/axe-scan.mjs "${2:-http://localhost:3000}" || rc=1
else echo "(add --axe [url] with the web app running for an axe-core scan)"; fi
(( rc == 0 )) && echo "accessibility: OK" || echo "accessibility: ATTENTION NEEDED" >&2
exit $rc
