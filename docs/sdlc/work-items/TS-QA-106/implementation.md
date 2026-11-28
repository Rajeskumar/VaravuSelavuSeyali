# Implementation (as built)

- `qa/mobile/flows/regression/` flows with `.seed.py` / `.verify.py`, shared checks in `qa/mobile/scripts/flow_checks.py`; input testIDs in the app.
- `qa/e2e/tests/account/account-recovery.spec.ts` with a dedicated user, run once per run (owner-approved single-browser skip);
  `qa/scripts/issue_qa_reset_token.py` issues the token. The old-password-refused step is covered by `test_email_verification.py`.
- Safeguards: mobile flows run only against the isolated backend; the token script accepts only the local QA database.
- Open (ROADMAP): the provisioning scripts have no database host guard; two flow waits can pass before a save ends.
