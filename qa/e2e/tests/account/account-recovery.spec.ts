import { test, expect, Browser, Page } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { QA_RESET_USER } from '../../fixtures/users.fixture';
import { env } from '../../helpers/env';
import { issueResetToken } from '../../helpers/reset-token.helper';
import { dismissCookieConsent } from '../../helpers/responsive.helper';

// Coverage map W-06 and W-43 (backlog A3): a successful password reset, then "Sign out of all devices".
// Tagged @account like account-security.spec.ts: it signs in for real twice (two devices), so it runs in the
// account step, which then uses 4 of the 5 logins a minute. That the old password is refused after a reset is
// proven at the real login route by varavu_selavu_app/tests/test_email_verification.py (test_full_reset_flow_...),
// so it doesn't spend a third login here.

async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: env.BASE_URL, storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

/** Signs in; a 429 is the shared per-minute budget, so wait for the next window and retry once. */
async function signIn(page: Page, password: string): Promise<void> {
  const login = new LoginPage(page);
  await login.goto();
  await dismissCookieConsent(page);
  for (let tries = 0; tries < 2; tries += 1) {
    const answered = page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST');
    await login.login(QA_RESET_USER.email, password);
    const status = (await answered).status();
    if (status === 429) {
      await page.waitForTimeout(61_000);
      continue;
    }
    expect(status).toBe(200);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    return;
  }
  throw new Error('still rate limited after waiting a full window');
}

test.describe('password recovery and sign out everywhere (UI) @account @critical', () => {
  test('reset the password from a link, then sign out of all devices', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'dedicated account: used once per run');
    test.setTimeout(240_000);
    const NEW = `${QA_RESET_USER.password}r7`;

    // --- Reset through the page the emailed link opens ---
    const first = await newDevice(browser);
    const token = issueResetToken(QA_RESET_USER.email);
    await first.goto(`/reset-password?token=${token}`);
    await dismissCookieConsent(first);
    await first.getByLabel(/^New Password/).fill(NEW);
    await first.getByLabel(/^Confirm New Password/).fill(`${NEW}x`);
    await first.getByRole('button', { name: 'Reset Password' }).click();
    await expect(first.getByRole('alert')).toHaveText('Passwords do not match');
    await first.getByLabel(/^Confirm New Password/).fill(NEW);
    await first.getByRole('button', { name: 'Reset Password' }).click();
    await expect(first.getByRole('status')).toContainText('Password reset');
    await expect(first).toHaveURL(/\/login/, { timeout: 15_000 });

    // The link works once only.
    await first.goto(`/reset-password?token=${token}`);
    await first.getByLabel(/^New Password/).fill(`${NEW}again`);
    await first.getByLabel(/^Confirm New Password/).fill(`${NEW}again`);
    await first.getByRole('button', { name: 'Reset Password' }).click();
    await expect(first.getByRole('alert')).toContainText('invalid or has expired');

    // The new password works.
    await signIn(first, NEW);

    // --- Sign out of all devices ends this device AND the other one ---
    const second = await newDevice(browser);
    await signIn(second, NEW);

    await first.goto('/account');
    const security = first.getByRole('region', { name: 'Security' });
    await expect(security.getByText('This device')).toBeVisible({ timeout: 15_000 });
    await security.getByRole('button', { name: 'Sign out of all devices' }).click();
    await expect(first).toHaveURL(/\/($|login)/, { timeout: 20_000 });
    await first.goto('/account');
    await expect(first).toHaveURL(/\/login/, { timeout: 20_000 });

    await second.goto('/account');
    await expect(second).toHaveURL(/\/login/, { timeout: 20_000 });

    await first.context().close();
    await second.context().close();
  });
});
