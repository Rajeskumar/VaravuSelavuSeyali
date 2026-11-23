#!/usr/bin/env bash
# Dependency audits plus tracked/untracked secret scanning; deeper history scan when available.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
rc=0
case "${1:-}" in
  '') make --no-print-directory audit-all || rc=1 ;;
  --no-audit) ;;
  *) echo 'usage: security.sh [--no-audit]' >&2; exit 2 ;;
esac
python3 scripts/quality/secret_scan.py || rc=1
if command -v gitleaks >/dev/null; then
  gitleaks detect --no-banner --redact || rc=1
else
  echo 'History scan not run (gitleaks unavailable); lightweight scan only.'
fi
exit "$rc"
