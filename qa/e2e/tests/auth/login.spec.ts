import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../pages/LoginPage';
import { QA_USERS } from '../../fixtures/users.fixture';
import { env } from '../../helpers/env';

// No "valid credentials reach the dashboard" test here — smoke.spec.ts's golden path
// already exercises exactly that as its first step, and this endpoint's real rate limit
// (5/minute, shared across the whole run — see README's "Real rate limits") means an
// extra real login purely to re-prove the same thing costs more than it's worth.
test.describe('login @regression @auth', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('wrong password is rejected with a clear error, no navigation', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(QA_USERS.primary.email, 'definitely-the-wrong-password');
    await login.expectErrorMessage(/incorrect email or password/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('unknown email is rejected with the same generic error (no user enumeration)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login('definitely-not-a-real-user@trackspense.qa', 'whatever-Passw0rd!');
    await login.expectErrorMessage(/incorrect email or password/i);
  });

  test('empty credentials do not submit', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.submitButton.click();
    // HTML5 `required` blocks submission client-side — still on /login, no request fired.
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated visit to a protected route redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('a logged-in visit to /login redirects straight to /dashboard', async ({ browser }) => {
    // browser.newContext() does not inherit the project's baseURL — see session.spec.ts's
    // identical note.
    const context = await browser.newContext({ storageState: 'e2e/auth/primary.json', baseURL: env.BASE_URL });
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await context.close();
  });
});
