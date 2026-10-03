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
    // The backend's 401 for bad credentials is asserted for real in api/tests/auth-api.spec.ts;
    // this test only proves the UI renders it. Stubbing the response keeps it out of the
    // shared 5/minute login budget: with setup (2) + smoke (1) + registration's auto-login (1)
    // + session.spec's logout login (1), one more real attempt here tipped the run into 429s.
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid credentials' }) }),
    );
    const login = new LoginPage(page);
    await login.goto();
    await login.login(QA_USERS.primary.email, 'definitely-the-wrong-password');
    await login.expectErrorMessage(/incorrect email or password/i);
    await expect(page).toHaveURL(/\/login/);
  });

  // "Unknown email gets the same generic error" lives in api/tests/auth-api.spec.ts: as a UI
  // test here it was one real login too many for the 5/minute budget (see README).

  test('empty credentials do not submit', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    // The form is noValidate, so LoginPage.handleLogin guards empty fields itself. Asserting
    // that no request fires matters: an empty submit used to reach the server and spend one
    // of the 5/minute login attempts this whole run shares (see README).
    let loginRequests = 0;
    page.on('request', (req) => { if (req.url().includes('/api/v1/auth/login')) loginRequests += 1; });
    await login.submitButton.click();
    await login.expectErrorMessage(/enter your email and password/i);
    await expect(page).toHaveURL(/\/login/);
    expect(loginRequests).toBe(0);
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
