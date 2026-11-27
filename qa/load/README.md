# TrackSpense Isolated 1,000-DAU Load-Test Harness (`qa/load/`)

Implements the TS-OBS-001 load qualification harness for 1,000 daily active users (60,000 req/day; 20 RPS warm expected, 50 RPS headroom, 100 RPS spike, bounded stress ladder, 2h soak).

## Safety Rules (Fail-Closed)
1. **Never target production** (`cerebroos.com`, `trackspense.app`, prod Cloud Run, or prod Supabase). `target_guard.py` and `scenarios.js` fail closed on production patterns, missing allowlists, missing `ts-load-*` run markers, or redirects to unlisted hosts.
2. **Non-local runs require explicit authorization** (`LOAD_TEST_NON_LOCAL_AUTHORIZED=true` and `LOAD_TEST_TARGET_ALLOWLIST`).
3. **Never implicitly load `.env`** and never use SQLite for capacity claims.
4. **Never automatically replay ambiguous writes** (timeouts/5xx) and never write credentials into summary reports.

## Hard Stop Conditions
Abort immediately if any of the following hold:
- Unexpected errors `> 5%` for 60 s
- Core p99 `> 10 s` for 60 s
- DB connections `> 80%` of available connection budget for 60 s
- OOM, correctness/reconciliation failure, or target mismatch

## Local Preflight & Smoke Example
```bash
export LOAD_TEST_BASE_URL="http://127.0.0.1:18080"
export LOAD_TEST_TARGET_ALLOWLIST="127.0.0.1,localhost"
export LOAD_TEST_RUN_MARKER="ts-load-local-smoke"
python3 qa/load/target_guard.py
```
