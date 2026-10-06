#!/usr/bin/env bash
# Deterministic security evidence: dependency audits (existing make targets) + a lightweight
# secret scan of tracked files. gitleaks is used too when installed. No new dependencies.
#   scripts/quality/security.sh            audits + secret scan
#   scripts/quality/security.sh --no-audit secret scan only (offline)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
rc=0

if [[ "${1:-}" != "--no-audit" ]]; then
  echo "== dependency audits (make audit-all)"; make --no-print-directory audit-all || rc=1
fi

echo "== tracked files that should never be tracked"
bad="$(git ls-files | grep -Ei '(^|/)(\.env(\.[a-z]+)?|.*service.?account.*\.json|.*credentials.*\.json|.*\.pem|.*\.p12|id_rsa)$' | grep -Ev '\.env\.example$' || true)"
# web/mobile .env hold public config only (API URL, OAuth client id) — verify rather than assume
for f in $bad; do
  if grep -Eiq '(secret|password|private_key|api[_-]?key|token)\s*=' "$f" 2>/dev/null; then echo "  SECRET-LIKE CONTENT: $f"; rc=1; else echo "  tracked (no secret-like keys): $f"; fi
done

echo "== secret patterns in tracked text files"
pat='-----BEGIN ((RSA|EC|OPENSSH|DSA) )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|"private_key"\s*:'
hits="$(git ls-files -z | grep -zEv '(package-lock\.json|poetry\.lock|\.(png|jpe?g|gif|ico|woff2?|ttf|pdf|db|jpg)$)' | xargs -0 grep -InE "$pat" 2>/dev/null | grep -v 'scripts/quality/security.sh' || true)"
if [[ -n "$hits" ]]; then echo "$hits"; rc=1; else echo "  none found"; fi

if command -v gitleaks >/dev/null; then echo "== gitleaks"; gitleaks detect --no-banner --redact || rc=1
else echo "(gitleaks not installed — optional deeper history scan)"; fi

(( rc == 0 )) && echo "security: OK" || echo "security: ATTENTION NEEDED" >&2
exit $rc
