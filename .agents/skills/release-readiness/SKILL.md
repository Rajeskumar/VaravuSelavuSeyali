---
name: release-readiness
description: Assess a release candidate from existing CI, review and operational evidence. Use for "ready to release?", release review or ready to tag. Produces PASS, PASS_WITH_APPROVED_WAIVERS, BLOCKED or INCOMPLETE_EVIDENCE; never tags or deploys.
---

Assessment only; start in a fresh session. Never re-run suites CI already ran on the candidate.

1. Freeze the candidate on `main`, then run `make release-prepare VERSION=x.y.z`. It checks
   exact-candidate unit/QA/framework CI (the unit run includes secret scan + audits), Alembic
   revisions since the last release (+ `migrations.yml`), previous serving images, linked work-item
   gates, and writes an untracked `docs/sdlc/releases/v<version>/release.json` plus release.md.
2. Read its summary. Fill only what it could not prove (`configuration`, unreviewed commits,
   backward compatibility of new migrations) from original sources, or record an approved waiver
   (manual checks only; CI, security and production checks cannot be waived).
3. `scripts/quality/sdlc.py release-gate docs/sdlc/releases/v<version>/release.json` → verdict.
4. **BLOCKED (e.g. red CI): stop.** Open a bug work item with the failing run link and hand off;
   do not debug inside the release. Re-enter only when CI on the new SHA is green.
5. Report the verdict, open items and waivers. Execution needs explicit authorization → `deployment`.
   Detail: `.ai-sdlc/workflows/deploy.md` (Readiness) and `.ai-sdlc/checklists/release-checklist.md`.
