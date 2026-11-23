# Release checklist

Readiness evidence on the candidate:
- [ ] unit.yml, qa.yml and framework.yml latest eligible main-branch runs pass on the exact SHA.
- [ ] Required acceptance, deterministic checks, routed reviews and security audits are current.
- [ ] No unresolved P0; non-P0 waivers have owner, reason, reference and expiry; fixed findings reverified.
- [ ] Critical journeys and applicable docs/qa UAT covered; native devices checked when a native build ships.
- [ ] Migrations rehearsed on supported baseline; compatible with previous code; lock/backfill risk assessed.
- [ ] Config/flags/secrets provisioned and documented; release push entitlement enabled if native push ships.
- [ ] Previous images available; schema-aware rollback/roll-forward and partial deployment response stated.
- [ ] Product docs, feature status, privacy/terms and changelog updated where applicable.

Execution (only after explicit authorization):
- [ ] Candidate-scoped authorization recorded; release record matches version and commit.
- [ ] release.sh gates pass; tag pushed; both Cloud Build outcomes and migration result observed.
- [ ] Actual serving revisions/images/traffic match the candidate for backend AND frontend.
- [ ] Read-only production smoke passes; error signals checked over a recorded observation window.
- [ ] Release outcome, build links, evidence and follow-up owners recorded; no unverified success claim.

External owner items (OAuth origins, SMTP, push, legal, token/IAM setup) require actual evidence or remain
incomplete. A checklist or JSON field alone never grants permission. Details: workflows/deploy.md.
