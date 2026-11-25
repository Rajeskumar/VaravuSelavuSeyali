# AGENTS.md - qa/mobile (native E2E)

Maestro flows + scripts that run the compiled app on iOS Simulator / Android Emulator (TS-QA-103). Root and `qa/AGENTS.md` rules apply.

- **Never** point this suite at production, a developer database or `.env`: go through `start-test-backend.sh` /
  `run_test_backend.py` (guards in `e2e_guard.py`, tested by `scripts/quality/tests/test_mobile_e2e_guard.py`).
  Never weaken a guard to make a run pass.
- The API port is compiled into the app (default 18080); changing it needs a rebuild.
- testIDs are a contract with the app: `<screen>.<element>`; the app side is `varavu_selavu_mobile/AGENTS.md`.
  Update flows in the same change that renames an id (`src/e2eSelectors.test.ts` enforces it).
- Flows are order-independent and use a fresh user each (`run_flows.py`). Declare `# LOGINS: n`. No real login
  rate-limit bypass; harness-side seeding uses minted tokens (`e2e_api.py`).
- Flows that count network requests (`seed.py expect-proxy`) rely on `run_flows.py` resetting the fault proxy before every attempt;
  never share proxy state between flows. A flow without an Android variant declares `# PLATFORMS: ios`; it is then reported SKIPPED
  on Android (never as a pass).
- Do not delete flows or remove assertions to get green (`scripts/quality/test_integrity.py` treats that as weakening).
- Build outputs, tools and reports are gitignored (`.build/`, `.tools/`, `reports/`).
