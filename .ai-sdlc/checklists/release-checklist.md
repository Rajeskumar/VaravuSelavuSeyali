# Release checklist

Readiness evidence on the candidate (`make release-prepare` fills what it can prove):
- [ ] unit.yml (incl. test-integrity, secret scan, audits), qa.yml and framework.yml pass on the exact SHA.
- [ ] Required acceptance, deterministic checks, routed reviews and security audits are current.
- [ ] No unresolved P0; non-P0 waivers have owner, reason, reference and expiry; fixed findings reverified.
- [ ] Critical journeys and applicable docs/qa UAT covered; native devices checked when a native build ships.
- [ ] Native mobile E2E, when the record has a `native-mobile-e2e` check (mobile code changed since the previous release): run the regression
  locally on iOS and Android against the exact SHA (`qa/mobile/README.md`) and record passed with both reports. Local only; not run in CI.
  Backend-only changes do not make it required: if the release changes an API the app uses, run it anyway.
- [ ] Migrations rehearsed from the previous release (`migrations.yml`); compatible with previous code; lock/backfill risk assessed.
- [ ] Config/flags/secrets provisioned and documented; release push entitlement enabled if native push ships.
- [ ] Previous images available; schema-aware rollback/roll-forward and partial deployment response stated.
- [ ] Product docs, feature status, privacy/terms and changelog updated where applicable.

Execution (only after explicit authorization):
- [ ] Candidate-scoped authorization recorded; release record matches version and commit.
- [ ] release.sh gates pass; tag pushed; `make release-verify` observed both builds and the migration result.
- [ ] Actual serving revisions/images/traffic match the candidate for backend AND frontend.
- [ ] Read-only production smoke passes; error signals checked over a recorded observation window.
- [ ] Release outcome, build links, evidence and follow-up owners recorded; no unverified success claim.

External owner items (OAuth origins, SMTP, push, legal, token/IAM setup) require actual evidence or remain
incomplete. A checklist or JSON field alone never grants permission. Details: workflows/deploy.md.
