# Test specification

| Scenario ID | AC IDs | Level / location | Expected |
|---|---|---|---|
| Q1 | AC-001 | `make mobile-e2e-ios` and `make mobile-e2e-android`, SUITE=all | every applicable flow passes, including stored-data checks |
| Q2 | AC-002 | `npm run qa:account` on a local stack, and CI | passes; no 429 |
| Q3 | AC-003 | `scripts/quality/tests/test_qa_reset_token_guard.py` | other hosts, databases and addresses are refused |
