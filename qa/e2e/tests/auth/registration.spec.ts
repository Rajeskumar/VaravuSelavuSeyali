import { test, expect } from '../../fixtures/auth.fixture';
import { RegisterPage } from '../../pages/RegisterPage';
import { env } from '../../helpers/env';
import { RUN_ID, uniqueSuffix } from '../../helpers/test-data.helper';

// NOTE on scope: POST /auth/register is rate-limited to 5/minute... no — 5/HOUR per IP on
// the real backend, and that bucket is shared with global.setup's persona provisioning and
// api/tests/auth-api.spec.ts's own register-validation tests (all hit the same backend
// instance from the same CI runner IP). Duplicate-email / weak-password rejection is
// therefore tested once, at the API layer (auth-api.spec.ts), not repeated here — this
// file only covers the UI-level golden path, which is what a duplicate register-validation
// test would not add much over. See qa/README.md's "Real rate limits" section for the budget.
test.describe('registration @regression @auth', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a new account can register and lands on the dashboard', async ({ page }) => {
    // NOTE: this test showed intermittent hangs at getByLabel('Name') while verifying this
    // framework in a sandboxed local dev environment — not reproducible via a manual
    // browser session (the same field resolves instantly there), and the equivalent
    // registration flow is independently proven working by global.setup.ts (every run) and
    // api/tests/auth-api.spec.ts's register-validation tests. Recorded traces showed zero
    // network activity during the hang, which points at something environment-specific
    // (sandboxed Chromium networking/DNS) rather than an app or framework bug — flagged as
    // a watch item for real CI rather than "fixed" outright. The extended timeout is
    // deliberate headroom either way.
    test.setTimeout(120_000);

    const register = new RegisterPage(page);
    await register.goto();
    const email = `qa.newuser.${RUN_ID}.${uniqueSuffix()}@trackspense.qa`;
    await register.register({ name: 'QA New User', email, password: env.QA_USER_PASSWORD });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  });
});
