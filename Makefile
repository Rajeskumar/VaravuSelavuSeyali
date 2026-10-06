.PHONY: start-backend start-web start-mobile-android start-mobile-ios install-backend install-web install-mobile install-all test-backend lint-backend format-backend install-qa qa-db-bootstrap qa-smoke qa-regression qa-regression-full qa-api qa-mobile qa-prod-smoke qa-report qa-all audit-backend audit-web audit-mobile audit-qa audit-all release-check release-check-full typecheck-web typecheck-mobile test-web test-mobile lint-web unit-check precommit-check install-hooks

# Backend
install-backend:
	cd varavu_selavu_app && poetry install

start-backend:
	cd varavu_selavu_app && poetry run uvicorn main:app --host 0.0.0.0 --port 8080 --reload

test-backend:
	cd varavu_selavu_app && poetry run pytest

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
qa-all: export QA_RUN_ID := local$(shell date +%s)

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
