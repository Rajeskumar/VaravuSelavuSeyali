import { test, expect } from '@playwright/test';
import { dismissCookieConsent } from '../../helpers/responsive.helper';

/**
 * Form behaviour that must never reach the server: sign-up validation and the password
 * show/hide control. Runs signed out, submits nothing, so it costs none of the 5-logins/minute or
 * 5-registrations/hour budget (see qa/README.md) — the register/login requests are asserted to
 * never fire.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('sign-up validation @regression', () => {
  test('invalid input is explained per field and never sent', async ({ page }) => {
    let registerCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/auth/register')) registerCalls += 1; });
    await page.goto('/register');
    await dismissCookieConsent(page);
    await page.getByLabel(/^Name/).fill('QA Person');
    await page.getByLabel(/^Email/).fill('not-an-email');
    await page.getByLabel(/^Password/).first().fill('abc');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText('Enter a valid email address, like name@example.com.')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
    expect(registerCalls, 'sign-up validation must happen before any request').toBe(0);
  });

  test('a field error clears as soon as the field is corrected', async ({ page }) => {
    await page.goto('/register');
    await dismissCookieConsent(page);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText('Enter your name.')).toBeVisible();
    await page.getByLabel(/^Name/).fill('QA Person');
    await expect(page.getByText('Enter your name.')).toHaveCount(0);
  });
});

test.describe('password field @regression', () => {
  for (const route of ['/login', '/register']) {
    test(`${route}: Show/Hide password toggles the field without submitting`, async ({ page }) => {
      await page.goto(route);
      await dismissCookieConsent(page);
      const field = page.getByLabel(/^Password/).first();
      await field.fill('typed-by-hand');
      await expect(field).toHaveAttribute('type', 'password');
      await page.getByRole('button', { name: 'Show password' }).click();
      await expect(field).toHaveAttribute('type', 'text');
      await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Hide password' }).click();
      await expect(field).toHaveAttribute('type', 'password');
    });
  }
});
