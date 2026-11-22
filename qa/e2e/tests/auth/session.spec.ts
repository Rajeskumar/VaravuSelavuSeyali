import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../pages/LoginPage';
import { QA_SESSION_USER } from '../../fixtures/users.fixture';
import { env } from '../../helpers/env';

test.describe('session persistence @regression @auth', () => {
  test('a logged-in session survives a page reload', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/please login/i)).toHaveCount(0);
  });

  test('logout clears the session and returns to /login', async ({ browser }) => {
    // Headroom for one 61s rate-limit wait below, plus /login's Google Sign-In script load.
    test.setTimeout(150_000);

    // Fresh login, as QA_SESSION_USER, in an isolated unauthenticated context. Logging out
    // ends every access token the account holds (users.token_valid_after), on every device,
    // so doing this as primary/secondary broke every other test still using
    // e2e/auth/{primary,secondary}.json. Nothing else logs in as QA_SESSION_USER except the
    // smoke test (see fixtures/users.fixture.ts); when CI runs this on several browsers at
    // once, the others recover through the web app's refresh-on-401, as real devices do.
    //
    // browser.newContext() needs baseURL passed explicitly (it does NOT get it from the
    // project's `use` config the way the default `page` fixture does). It DOES inherit
    // `storageState` from project config, though — the real bug caught verifying this
    // framework: without clearing it here, this "fresh" context was silently already
    // logged in as primary (the chromium project's default storageState), so
    // page.goto('/login') redirected straight to /dashboard (RequireGuest) and the
    // subsequent getByLabel(/email/i).fill() hung forever waiting for a field that could
    // never appear.
    const context = await browser.newContext({ baseURL: env.BASE_URL, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const login = new LoginPage(page);
    // CI's multi-browser step runs this on firefox, webkit and mobile-iphone in parallel: three
    // real logins in the same minute as the earlier steps' logins can exceed the 5/minute
    // limit. A 429 here is the shared budget, not the behaviour under test, so wait out the
    // window once and retry.
    await login.goto();
    await login.login(QA_SESSION_USER.email, QA_SESSION_USER.password);
    const rateLimited = page.getByText(/too many attempts/i);
    const landed = await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 20_000 }).then(() => 'dashboard' as const),
      rateLimited.waitFor({ timeout: 20_000 }).then(() => 'rate-limited' as const),
    ]);
    if (landed === 'rate-limited') {
      await page.waitForTimeout(61_000);
      await login.login(QA_SESSION_USER.email, QA_SESSION_USER.password);
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    }

    await page.goto('/account');
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await context.close();
  });
});

// Protected-API / CSRF / 401 assertions live in api/tests/auth-api.spec.ts (the `api`
// project talks directly to API_BASE_URL — a browser project's `request` fixture is scoped
// to BASE_URL, the frontend origin, which doesn't proxy /api/v1/* in local dev).
