---
name: release-readiness
description: Assess a release candidate from existing CI, test, review and operational evidence. Use for ready to release, release review or ready to tag. Produces PASS, PASS_WITH_APPROVED_WAIVERS, BLOCKED or INCOMPLETE_EVIDENCE; never executes deployment.
---

Follow `.ai-sdlc/workflows/release-review.md` and `.ai-sdlc/checklists/release-checklist.md`.
Gather exact-candidate unit, QA and framework CI, work-item validation and original review evidence.
Run only missing applicable checks within scope. Report verdict, evidence sources, waivers, blockers
and omissions. A readiness assessment does not authorize tags/pushes/deployment. For an explicitly
authorized release, hand off to the deployment skill and `.ai-sdlc/workflows/deploy.md`.
