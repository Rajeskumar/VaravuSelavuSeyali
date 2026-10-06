#!/usr/bin/env bash
# Deterministic reviewer routing: classify the diff and print which AI reviewers (skills) are
# worth running, plus the deterministic checks to run first. Costs nothing and prevents
# spawning every reviewer for a small change. Rules mirror .ai-sdlc/README.md "Routing".
#
#   scripts/quality/route-review.sh [base-ref]     default base: origin/main, else main
#   scripts/quality/route-review.sh --files a b c  classify an explicit file list
#       optional: LINES=<changed lines> and ADDED_FILES="<new files>" env vars (diff mode computes both)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

lines="${LINES:--1}"; added="${ADDED_FILES:-}"
if [[ "${1:-}" == "--files" ]]; then
  shift; files="$(printf '%s\n' "$@")"
else
  base="${1:-}"
  if [[ -z "$base" ]]; then
    if git rev-parse --verify -q origin/main >/dev/null; then base=origin/main; else base=main; fi
  fi
  mb="$(git merge-base "$base" HEAD 2>/dev/null || echo HEAD)"
  # committed since the merge-base + staged + unstaged + untracked
  lines="$( { git diff --numstat "$mb" | awk '{s+=$1+$2} END{print s+0}'; } )"
  untracked_lines="$(git ls-files --others --exclude-standard -z | xargs -0 cat 2>/dev/null | wc -l | tr -d ' ')"
  lines=$(( lines + untracked_lines ))
  added="$( { git diff --name-only --diff-filter=A "$mb"; git ls-files --others --exclude-standard; } | sort -u)"
  files="$( { git diff --name-only "$mb" HEAD; git diff --name-only; git diff --name-only --cached; git ls-files --others --exclude-standard; } | sort -u | sed '/^$/d')"
fi

if [[ -z "$files" ]]; then echo "No changes to review."; exit 0; fi

has() { grep -Eq "$1" <<<"$files"; }
reviewers=" "; checks=""; notes=""; tiny=0
add() { [[ "$reviewers" == *" $1 "* ]] || reviewers+="$1 "; }

code_re='\.(py|ts|tsx|js|jsx|sql|sh|ya?ml|toml|json)$'
doc_re='\.(md|txt|png|jpg|jpeg|svg|gif)$|^docs/|^CHANGELOG|^ROADMAP|^README'
nondoc="$(grep -Ev "$doc_re" <<<"$files" || true)"

ui_re='^varavu_selavu_ui/src/(components|pages|context|hooks)/.*\.(tsx|ts)$|^varavu_selavu_mobile/(src|app)/.*\.(tsx|ts)$|^varavu_selavu_mobile/App\.tsx$'
style_re='\.(css|scss)$|^varavu_selavu_ui/src/theme\.ts$|^varavu_selavu_mobile/src/theme'
sec_re='^varavu_selavu_app/varavu_selavu_service/(auth|core)/|/api/.*routes?\.py$|upload|csrf|cors|permission|authoriz|security'
ai_re='ai_quota|chat_service|ai-analyst|llm|openai|gemini|prompt'
db_re='^varavu_selavu_app/alembic/versions/|db/models\.py$|db/schema\.sql$'
perf_re='analytics|insight|analysis|aggregation|balance|export|recurring_service|plotly|chart|Feed|virtual'
infra_re='^Dockerfile|cloudbuild|^\.github/workflows/|docker-compose|^\.cloudbuild/'
qa_re='^qa/'
backend_re='^varavu_selavu_app/.*\.py$'
newfeature_re='^varavu_selavu_app/varavu_selavu_service/services/[a-z_]+\.py$|^varavu_selavu_ui/src/(pages|components)/|^varavu_selavu_mobile/src/(screens|components)/'

risky_re="$sec_re|$ai_re|$db_re|$infra_re"
nfiles="$(wc -l <<<"$files" | tr -d ' ')"
if [[ -z "$nondoc" ]]; then
  notes+="- Docs/copy-only change: no AI reviewer needed.\n"
elif (( lines >= 0 && lines <= 10 && nfiles <= 2 )) && ! has "$risky_re"; then
  tiny=1
  notes+="- Tiny change (${lines} lines, no auth/AI/DB/infra paths): deterministic checks only. Escalate if it alters behaviour.\n"
else
  if has "$backend_re|$ui_re|$qa_re|$infra_re|$db_re"; then add implementation-review; fi
  if has "$ui_re|$backend_re|$qa_re"; then add test-review; fi
  if has "$ui_re"; then add ux-review; add accessibility-review; fi
  if has "$style_re" && ! has "$ui_re"; then
    notes+="- Style-only change: run accessibility-review only if colour, focus or sizing tokens changed.\n"
  fi
  if has "$sec_re|$ai_re|$infra_re"; then add security-review; fi
  if has "$db_re"; then add security-review; notes+="- Migration: apply the migration checklist in standards/backend.md (reversible, backward-compatible, locks).\n"; fi
  if has "$perf_re"; then add performance-review; fi
  if [[ -n "$added" ]] && grep -Eq "$newfeature_re|^docs/features/" <<<"$added"; then add product-review; fi
  if has "$infra_re"; then notes+="- Deploy/CI config: consider release-readiness before merging to main.\n"; fi
fi

# deterministic checks by area
has '^varavu_selavu_app/' && checks+=" make test-backend;"
has '^varavu_selavu_ui/' && checks+=" make lint-web typecheck-web test-web;"
has '^varavu_selavu_mobile/' && checks+=" make typecheck-mobile test-mobile;"
has "$ui_re" && checks+=" scripts/quality/accessibility.sh;"
has "$sec_re|$ai_re|package(-lock)?\.json|pyproject|poetry\.lock|^\.env" && checks+=" scripts/quality/security.sh;"
has '^qa/' && checks+=" scripts/quality/e2e.sh smoke;"

(( tiny )) && checks=" scripts/quality/verify.sh;"
echo "Changed files: $nfiles (changed lines: $lines)"
echo "Deterministic checks first:${checks:- none (scripts/quality/verify.sh covers the basics)}"
echo "Reviewers to run:${reviewers% }"
[[ "$reviewers" == " " ]] && echo "  (none)"
[[ -n "$notes" ]] && printf "Notes:\n$notes"
echo "Order: implementation → product → test → security → accessibility → ux → performance. Release candidate? add release-readiness."
