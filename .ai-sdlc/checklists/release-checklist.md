# Release checklist

**Evidence**
- [ ] `unit.yml` and `qa.yml` green on the release commit; `make release-check` green locally.
- [ ] `scripts/quality/security.sh` clean (audits at high; no secrets).
- [ ] `scripts/quality/accessibility.sh` clean; no open a11y P0/P1.
- [ ] No open P0/P1 from any review; accepted P2s listed.

**Data and deploy**
- [ ] Migrations reviewed: random-hex ids, reversible, backward-compatible with the deployed version (run before deploy via `migrate-db` job).
- [ ] New env vars/flags documented and set in Cloud Run; `.env.example` updated; no secrets committed.
- [ ] Rollback plan stated (previous image + compatible schema).

**Product**
- [ ] Critical journeys smoke-tested: sign-in, add expense, group split + settle up, AI ask, export/delete account.
- [ ] Web and mobile in step (or documented gap); mobile release builds set `TRACKSPENSE_ENABLE_PUSH=1` when push ships.
- [ ] Privacy policy / terms updated if data collected or processors changed.
- [ ] `CHANGELOG.md`, spec and `docs/FEATURE_STATUS.md` updated.

**Launch-owner items** (outside the repo): push config, OAuth origins, SMTP, legal sign-off — see `docs/product_review&testing_report/`.
