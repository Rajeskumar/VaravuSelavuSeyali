---
name: release-readiness
description: Decide whether a release candidate is READY, READY WITH FIXES or NOT READY by aggregating existing evidence (CI, tests, audits, open P0/P1, migrations, checklist). Use for "prepare this for production", "is this ready to release", "release review", "ready to tag". Does not redo individual reviews.
---

# Release readiness

Procedure: `.ai-sdlc/workflows/release-review.md`. Checklist: `.ai-sdlc/checklists/release-checklist.md`.

1. Identify the release range/commit. Gather evidence **without redoing reviews**: CI results for `unit.yml` and `qa.yml` on that commit, local `make release-check`, any prior review findings (open P0/P1), migrations in range, config/flag/secret changes, docs/changelog.
2. Run only what's missing and cheap: `scripts/quality/verify.sh --full`, `scripts/quality/security.sh`, `scripts/quality/accessibility.sh` — and only if no fresh result exists.
3. Walk the release checklist; each item ticked, waived with a reason, or failing.
4. Verdict — `READY` / `READY WITH FIXES` / `NOT READY` — with an evidence table (check → status → source), blocking items, accepted risks and exact next steps. Any open P0, red required check, or incompatible/unreviewed migration is NOT READY.

Anything that needs a human/launch-owner (push config, OAuth origins, SMTP, legal) is listed, not assumed. Do not tag, push or deploy.
