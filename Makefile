.PHONY: start-backend start-web start-mobile-android start-mobile-ios install-backend install-web install-mobile install-all test-backend lint-backend format-backend install-qa qa-db-bootstrap qa-smoke qa-regression qa-regression-full qa-api qa-mobile qa-prod-smoke qa-report qa-all audit-backend audit-web audit-mobile audit-qa audit-all release-check

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

# Mobile's Expo/Metro build toolchain currently carries known high-severity advisories
# (metro, metro-config, metro-transform-worker, @expo/metro, image-size, postcss — all
# transitive of @expo/config) that only clear with an Expo SDK major-version bump, not a
# routine dependency patch. Gated at critical here so the check stays meaningful without
# permanently red-lining every release on a pre-existing, tracked-separately issue; revisit
# this threshold once the Expo SDK is upgraded.
audit-mobile:
	cd varavu_selavu_mobile && npm audit --omit=dev --audit-level=critical

audit-qa:
	cd qa && npm audit --audit-level=high

audit-all: audit-backend audit-web audit-mobile audit-qa

# What to run before a prod deploy: the backend's own pytest suite (fast, in-process), the
# dependency-vulnerability audits (fast, no server needed), then the full qa/ gate
# (smoke+regression+api, against a real local stack). Doesn't include qa-regression-full or
# qa-mobile — those are for deliberate cross-browser/mobile checks, not every release.
# Doesn't include qa-prod-smoke either: that only makes sense to run AFTER a deploy, to
# confirm what's actually live — run it by hand once the deploy lands.
release-check: test-backend audit-all qa-all

# Utilities
install-all: install-backend install-web install-mobile install-qa

generate-mobile-assets:
	node varavu_selavu_mobile/generate_assets.js
