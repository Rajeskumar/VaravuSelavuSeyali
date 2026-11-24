# AGENTS.md — qa (Playwright smoke, regression, API, account suites)

Root `AGENTS.md` rules apply. Setup and local stack: `qa/README.md`. CI (`qa.yml`) is the
authoritative run; locally run only the failing specs to reproduce, then let CI run the matrix.

## Key Decisions
- **The suite runs at the real auth rate limits** (5 logins/min, 5 registrations/hour, in-memory per backend process) and the budget is spent exactly: don't add real logins or registrations — stub or use the API (`qa/README.md`). Restart the backend between local full runs.
- **Production gets only the read-only smoke** (`make qa-prod-smoke`): never run the normal suites, auth or writes against production.
