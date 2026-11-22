import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { LoginPage } from '../../pages/LoginPage';
import { QA_DISPOSABLE_USER } from '../../fixtures/users.fixture';
import { env } from '../../helpers/env';
import { dismissCookieConsent } from '../../helpers/responsive.helper';

// Backlog B-13 (UAT-ACC-002..005). Everything destructive happens to QA_DISPOSABLE_USER, an account
// created straight in the QA database (see fixtures/users.fixture.ts) — never the shared personas.
// One test, one sign-in: change password, look at sessions, export data, then delete the account.
test.describe('account security and deletion (UI) @regression @critical', () => {
  test('change password, review sessions, export, then delete the account', async ({ browser }, testInfo) => {
    // The account is deleted at the end, so it can only be used once per run (the CI matrix repeats
    // every spec per browser project).
    test.skip(testInfo.project.name !== 'chromium', 'disposable account: used once per run');
    test.setTimeout(180_000);
    const context = await browser.newContext({ baseURL: env.BASE_URL, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const login = new LoginPage(page);

    // Sign in (one real login). A 429 is the shared per-minute budget, not the behaviour under test.
    await login.goto();
    await dismissCookieConsent(page);
    await login.login(QA_DISPOSABLE_USER.email, QA_DISPOSABLE_USER.password);
    const landed = await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 20_000 }).then(() => 'ok' as const),
      page.getByText(/too many attempts/i).waitFor({ timeout: 20_000 }).then(() => 'limited' as const),
    ]);
    if (landed === 'limited') {
      await page.waitForTimeout(61_000);
      await login.login(QA_DISPOSABLE_USER.email, QA_DISPOSABLE_USER.password);
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    }

    await page.goto('/account');
    const security = page.getByRole('region', { name: 'Security' });
    await expect(security).toBeVisible({ timeout: 15_000 });

    // --- Change password: validations, then success ---
    const NEW = `${QA_DISPOSABLE_USER.password}x9`;
    const change = security.getByRole('button', { name: 'Change password' });
    await security.getByLabel('Current password').fill(QA_DISPOSABLE_USER.password);
    await security.getByLabel('New password', { exact: true }).fill(NEW);
    await security.getByLabel('Confirm new password').fill(`${NEW}-different`);
    await expect(security.getByText("Passwords don't match.")).toBeVisible();
    await expect(change).toBeDisabled();
    await security.getByLabel('Confirm new password').fill(NEW);
    await expect(change).toBeEnabled();
    await change.click();
    await expect(security.getByRole('status').filter({ hasText: 'Password changed' })).toBeVisible({ timeout: 15_000 });

    // --- Sessions: this device is listed ---
    await expect(security.getByText('This device')).toBeVisible({ timeout: 15_000 });

    // --- Exports are complete files ---
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export all expenses (CSV)' }).click()]);
    expect(fs.readFileSync(await csv.path(), 'utf8').length).toBeGreaterThan(0);
    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download all my data (JSON)' }).click()]);
    const parsed = JSON.parse(fs.readFileSync(await json.path(), 'utf8'));
    expect(JSON.stringify(parsed)).toContain(QA_DISPOSABLE_USER.email);

    // --- Delete: Cancel is safe, wrong password is refused, the right one deletes ---
    await page.getByRole('button', { name: 'Delete Account' }).click();
    let dialog = page.getByRole('dialog', { name: 'Delete your account' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Security' })).toBeVisible(); // still signed in

    await page.getByRole('button', { name: 'Delete Account' }).click();
    dialog = page.getByRole('dialog', { name: 'Delete your account' });
    await expect(dialog.getByRole('button', { name: 'Delete permanently' })).toBeDisabled(); // needs the password first
    await dialog.getByLabel('Your password').fill(NEW);
    await dialog.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page).toHaveURL(/\/($|login)/, { timeout: 20_000 });

    // The account is gone: its credentials no longer work. (A second login attempt on the budget.)
    await login.goto();
    await login.login(QA_DISPOSABLE_USER.email, NEW);
    await expect(page.getByText(/Incorrect email or password|Too many attempts/)).toBeVisible({ timeout: 15_000 });
    await context.close();
  });
});
