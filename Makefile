.PHONY: start-backend start-web start-mobile-android start-mobile-ios install-backend install-web install-mobile install-all test-backend lint-backend format-backend install-qa qa-db-bootstrap qa-smoke qa-regression qa-regression-full qa-api qa-mobile qa-prod-smoke mobile-e2e-tools mobile-e2e-build-ios mobile-e2e-build-android mobile-e2e-ios mobile-e2e-android qa-report qa-all audit-backend audit-web audit-mobile audit-qa audit-all release-check release-check-full typecheck-web typecheck-mobile test-web test-mobile lint-web unit-check precommit-check install-hooks

# Backend
install-backend:
	cd varavu_selavu_app && poetry install

start-backend:
	cd varavu_selavu_app && poetry run uvicorn main:app --host 0.0.0.0 --port 8080 --reload

test-backend:
	cd varavu_selavu_app && poetry run pytest -q

# Web Frontend
install-web:
	cd varavu_selavu_ui && npm install

start-web:
	cd varavu_selavu_ui && npm start

# Mobile App
install-mobile:
	cd varavu_selavu_mobile && npm install

start-mobile-android:
	cd varavu_selavu_mobile && npx expo run:android

start-mobile-ios:
	cd varavu_selavu_mobile && npx expo run:ios

start-mobile-web:
	cd varavu_selavu_mobile && npx expo start --web

# QA (Playwright — see qa/README.md)
install-qa:
	cd qa && npm ci && npx playwright install --with-deps chromium

qa-db-bootstrap:
	cd qa && npm run qa:db:bootstrap

qa-smoke:
	cd qa && npm run qa:smoke

qa-regression:
	cd qa && npm run qa:regression

qa-regression-full:
	cd qa && npm run qa:regression:full

qa-api:
	cd qa && npm run qa:api

qa-mobile:
	cd qa && npm run qa:mobile

qa-prod-smoke:
	cd qa && npm run qa:prod-smoke

# Native mobile E2E (Maestro on a real iOS Simulator / Android Emulator; qa/mobile/README.md). Not the same as
# qa-mobile above, which runs the *web* app in a phone-sized browser. Needs a build first; SUITE=smoke|regression|all.
SUITE ?= smoke
mobile-e2e-tools:
	qa/mobile/scripts/install-tools.sh
mobile-e2e-build-ios:
	qa/mobile/scripts/build-ios.sh
mobile-e2e-build-android:
	qa/mobile/scripts/build-android.sh
mobile-e2e-ios:
	qa/mobile/scripts/run.sh --platform ios --suite $(SUITE) $(if $(FLOW),--flow $(FLOW),) $(if $(RETRIES),--retries $(RETRIES),)
mobile-e2e-android:
	qa/mobile/scripts/run.sh --platform android --suite $(SUITE) $(if $(FLOW),--flow $(FLOW),) $(if $(RETRIES),--retries $(RETRIES),)

qa-report:
	cd qa && npm run qa:report

# Everything the qa/ framework has — smoke, then regression, then API, stopping on the
# first failure (make's default). This is the same order CI runs in
# (.github/workflows/qa.yml), just local and Chromium-only for speed.
qa-all: qa-smoke qa-regression qa-api

# One QA run ID shared by all three steps above (and so by release-check-full), the local
# equivalent of CI's GITHUB_RUN_ID. Without it every `playwright test` invocation minted
# its own run ID, so each step registered and logged in a fresh pair of QA personas, and
# the backend's real 5/hour register and 5/minute login limits turned the run into 429s.
# Target-specific, so it's inherited by qa-all's prerequisites; `:=` evaluates it once.
qa-all: export QA_RUN_ID := $(if $(QA_RUN_ID),$(QA_RUN_ID),local$(shell date +%s))

# Vulnerability audits — dependency-only checks (pip-audit / npm audit), not source-code
# scanning. Requires `make install-backend`/`install-web`/`install-mobile`/`install-qa` to
# have been run first (they read the installed lockfile state, same as CI would).
#
# pip-audit scans whatever's actually installed in the poetry venv, so a venv that's drifted
# from poetry.lock (e.g. stray `pip install`s from ad-hoc testing) will report phantom
# findings or hide real ones — run `poetry install --sync` if this ever looks wrong. It's
# added as a tracked dev dependency (pyproject.toml) rather than a global/manual install so
# `make install-backend` always has it.
audit-backend:
	cd varavu_selavu_app && poetry run pip-audit

# --omit=dev: on the JS side, "dependencies" vs "devDependencies" is a reasonable proxy for
# "ships in the app" vs "build tooling only" (webpack-dev-server, jest, etc.) — the latter's
# vulnerabilities don't reach production and shouldn't gate a release on their own.
audit-web:
	cd varavu_selavu_ui && npm audit --omit=dev --audit-level=high

# Gated at high, like web, with a reviewed allowlist (varavu_selavu_mobile/audit-allowlist.json)
# for advisories that have no patched release and reach only build/test tooling: braces (Metro,
# Jest) and node-forge (@expo/cli code signing). npm audit can't accept individual advisories, so
# the previous workaround was a critical-only threshold, which also let any NEW high through.
# Each allowlist entry carries a reviewBy date; past it, the gate fails until it's re-checked.
# (No pipefail needed: npm audit exits non-zero whenever anything is found, and the pipeline's
# status is check-audit's.)
audit-mobile:
	cd varavu_selavu_mobile && npm audit --omit=dev --json | node ../scripts/check-audit.js --level high --allowlist audit-allowlist.json

audit-qa:
	cd qa && npm audit --audit-level=high

audit-all: audit-backend audit-web audit-mobile audit-qa

# Fast local release gate, no servers needed: the backend's pytest suite plus the dependency
# audits. The pre-push hook runs this on pushes to main. The browser/API QA suites (qa-all) run
# in GitHub Actions (.github/workflows/qa.yml) on every push to main, against a clean stack,
# and pushing a release-* tag is refused unless that CI run passed on the tagged commit
# (scripts/pre-push.sh). So qa-all is no longer required locally.
release-check: test-backend audit-all

# release-check plus the full qa/ gate (smoke+regression+api) run locally. Needs the local stack
# up first (qa/README.md) and a backend restarted since the last run (in-memory rate limits).
# Doesn't include qa-regression-full, qa-mobile or qa-prod-smoke (run qa-prod-smoke by hand
# after a deploy lands).
release-check-full: release-check qa-all

# Fast checks that catch build-breaking type errors in seconds-to-minutes, no servers needed.
# scripts/pre-commit.sh runs only the subset matching the staged paths; this runs them all.
typecheck-web:
	cd varavu_selavu_ui && npx tsc --noEmit -p .

typecheck-mobile:
	cd varavu_selavu_mobile && npx tsc --noEmit -p .

# Jest + lint, mirroring .github/workflows/unit.yml. Not part of release-check/pre-push (they stay
# fast); CI runs these on every push, and `make unit-check` runs the lot locally.
test-web:
	cd varavu_selavu_ui && CI=true npx react-scripts test --watchAll=false

test-mobile:
	cd varavu_selavu_mobile && npx jest

lint-web:
	cd varavu_selavu_ui && npx eslint src --ext .ts,.tsx

unit-check: test-backend lint-web typecheck-web test-web typecheck-mobile test-mobile

precommit-check: test-backend typecheck-web typecheck-mobile

# Point git at the versioned hooks in .githooks/ (pre-commit: fast checks on commits to main;
# pre-push: release-check on pushes to main, CI must be green to push a release-* tag). Once per clone.
install-hooks:
	git config core.hooksPath .githooks

# Utilities
install-all: install-backend install-web install-mobile install-qa install-hooks

generate-mobile-assets:
	node varavu_selavu_mobile/generate_assets.js

# Repository AI SDLC tooling: install scripts/quality/requirements.txt in a local venv,
# then set SDLC_PYTHON to its Python executable (default: python3).
SDLC_PYTHON ?= python3
.PHONY: framework-check test-framework test-postgres qa-account qa-regression-extra
framework-check:
	$(SDLC_PYTHON) scripts/quality/validate-ai-sdlc.py
	$(SDLC_PYTHON) scripts/quality/sdlc.py validate
	$(SDLC_PYTHON) -m unittest discover -s scripts/quality/tests -v

test-framework:
	$(SDLC_PYTHON) -m unittest discover -s scripts/quality/tests -v

# ---- AI SDLC entry points (deterministic first; see .ai-sdlc/verification.md)
.PHONY: route check check-full test-integrity docs-touch release-prepare release-verify usage-report evals migration-rehearsal sync-codex
# Tier, reviewers, per-reviewer scopes/hashes for the current change.
route:
	@python3 scripts/quality/routing.py $(BASE)
# Changed-area checks; prints a summary, full logs in .sdlc-logs/.
check:
	@scripts/quality/verify.sh --profile fast $(if $(BASE),--base $(BASE),)
# Release profile (local integration stack required); CI normally supplies this evidence.
check-full:
	@scripts/quality/verify.sh --profile release
test-integrity:
	@python3 scripts/quality/test_integrity.py $(if $(BASE),--base $(BASE),)
docs-touch:
	@python3 scripts/hooks/docs-touch.py
# make release-prepare VERSION=1.3.0 [WORK_ITEMS="TS-1 TS-2"]
release-prepare:
	@test -n "$(VERSION)" || { echo "VERSION=x.y.z required"; exit 2; }
	@$(SDLC_PYTHON) scripts/quality/release_tools.py prepare $(VERSION) $(if $(WORK_ITEMS),--work-items $(WORK_ITEMS),)
# make release-verify VERSION=1.3.0 [WAIT=900] [SMOKE=1]
release-verify:
	@test -n "$(VERSION)" || { echo "VERSION=x.y.z required"; exit 2; }
	@$(SDLC_PYTHON) scripts/quality/release_tools.py verify $(VERSION) --wait $(or $(WAIT),0) $(if $(SMOKE),--smoke,)
# Token/agent usage from local session logs (numbers only); SINCE=YYYY-MM-DD
usage-report:
	@python3 scripts/quality/usage_report.py --codex $(if $(SINCE),--since $(SINCE),)
# Routing evals (free). Behavioral: make evals AGENT=claude|codex (costs tokens).
evals:
	@python3 scripts/quality/evals/run_evals.py $(if $(AGENT),--agent $(AGENT),)
# Needs SDLC_TEST_ENV=local and a throwaway localhost E2E_DATABASE_URL.
migration-rehearsal:
	@scripts/quality/migration-rehearsal.sh $(BASE)
sync-codex:
	@$(SDLC_PYTHON) scripts/quality/validate-ai-sdlc.py --sync-codex

# Dedicated disposable local database only; PG test modules must run in separate processes.
test-postgres:
	$(SDLC_PYTHON) scripts/quality/check-local-test-env.py
	cd varavu_selavu_app && poetry run pytest tests/test_analytics_e2e_pg.py -q
	cd varavu_selavu_app && poetry run pytest tests/test_groups_e2e_pg.py -q
	cd varavu_selavu_app && poetry run pytest 'tests/test_ai_quota.py::test_concurrent_reserves_never_overshoot_on_postgres' -q
	cd varavu_selavu_app && poetry run pytest tests/test_mcp_pg.py tests/test_mcp_migrations_pg.py -q
	cd varavu_selavu_app && poetry run pytest tests/test_settlement_pg.py -q

qa-account:
	@echo 'Waiting for the dedicated account-test login window (65 seconds)'
	sleep 65
	cd qa && npm run qa:account

# Complete the release browser matrix without re-running Chromium and spending auth budget twice.
qa-regression-extra:
	cd qa && npx playwright test --grep @regression --project=firefox --project=webkit --project=mobile-iphone
