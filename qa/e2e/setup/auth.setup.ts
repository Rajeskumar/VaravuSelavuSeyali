import { test as setup } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LoginPage } from '../pages/LoginPage';
import { QA_USERS } from '../fixtures/users.fixture';
import { dismissCookieConsent } from '../helpers/responsive.helper';

/**
 * Logs in each QA persona once through the real UI and saves the storage state
 * (cookie jar) for every other test to reuse via the `chromium`/`firefox`/`webkit`/
 * `mobile-iphone` projects' `dependencies: ['setup']`.
 *
 * Non-negotiable: `/auth/login` is rate-limited to 5/minute per IP on the real backend
 * — and, like `global.setup.ts`'s registration marker, this `setup` PROJECT itself reruns
 * once per `playwright test` invocation (`npm run qa:smoke` then `npm run qa:regression`
 * in one CI job = 2 invocations = 4 logins from this file alone before any real test logs
 * in). Reproduced directly verifying this framework: running smoke then regression
 * back-to-back hit "Too many attempts" partway through regression's own login tests.
 * Fixed the same way as registration — skip the real login when a storageState file for
 * this exact run's persona already exists (RUN_ID is stable across scripts in one CI job
 * via GITHUB_RUN_ID, so a stale file from a *previous* run never matches and still
 * triggers a real login).
 */
for (const persona of Object.values(QA_USERS)) {
  setup(`authenticate as ${persona.key}`, async ({ page }) => {
    const outPath = path.resolve(__dirname, '..', '..', persona.storageStatePath);
    if (fs.existsSync(outPath)) {
      const saved = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
      const savedUser = saved.origins?.[0]?.localStorage?.find((e: any) => e.name === 'vs_user')?.value;
      if (savedUser === persona.email) {
        console.log(`[auth.setup] ${persona.key} already authenticated for this run — reusing storageState.`);
        return;
      }
    }

    const login = new LoginPage(page);
    await login.loginAndWaitForDashboard(persona.email, persona.password);

    // Dismissing here (not per-test) means the choice is captured in storageState's
    // localStorage below and every test reusing it starts with the banner already gone —
    // otherwise it can physically overlap and intercept clicks on bottom-anchored controls
    // (the mobile FAB) at narrow viewports, caught verifying this framework.
    await dismissCookieConsent(page);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.context().storageState({ path: outPath });
  });
}
