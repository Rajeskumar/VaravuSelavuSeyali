import { test, expect } from '@playwright/test';
import { env } from '../../helpers/env';
import { dismissCookieConsent } from '../../helpers/responsive.helper';

// Backlog B-05 (UAT-AUTH-005/013) and B-14 (UAT-AUTH-010..012). None of these perform a real login
// or registration (the QA suite spends the auth rate limits exactly): the guards are checked
// signed-out, and refresh behaviour by stubbing the refresh endpoint in the browser only.
const SIGNED_OUT = { cookies: [], origins: [] };

test.describe('route guards and session recovery (UI) @regression @auth', () => {
  test.describe('signed out', () => {
    test.use({ storageState: SIGNED_OUT });

    for (const route of ['/expenses', '/groups', '/account']) {
      test(`${route} redirects to /login`, async ({ page }) => {
        await page.goto(route);
        await expect(page).toHaveURL(/\/login/);
        await dismissCookieConsent(page);
        await expect(page.getByLabel(/email/i)).toBeVisible();
      });
    }
    // Known product gap (ROADMAP): after signing in the app lands on /dashboard, not on the page
    // that was asked for. Only a pending group invite and assistant approvals are resumed.
  });

  test.describe('signed in', () => {
    const stubExpenses401 = async (page: any) => {
      await page.route('**/api/v1/expenses?**', async (route: any) => {
        if (route.request().method() === 'GET') await route.fulfill({ status: 401, json: { detail: 'Not authenticated' } });
        else await route.continue();
      });
    };

    test('a transient refresh failure (503) does not sign the person out', async ({ page }) => {
      await stubExpenses401(page);
      await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 503, json: { detail: 'unavailable' } }));
      await page.goto('/expenses');
      await page.waitForTimeout(3000);
      await expect(page).toHaveURL(/\/expenses/);
      expect(await page.evaluate(() => localStorage.getItem('vs_user'))).toBeTruthy();
    });

    test('a dead session (refresh answers 401) returns to the login page', async ({ page }) => {
      await stubExpenses401(page);
      await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401, json: { detail: 'expired' } }));
      await page.goto('/expenses');
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    });
  });
});

test.describe('password reset and email verification pages (UI) @regression @auth', () => {
  test.use({ storageState: SIGNED_OUT });

  // POST /auth/forgot-password (5/hour) and /auth/reset-password are rate-limited per IP, and the CI
  // matrix runs every spec once per browser project, so the real calls happen on Chromium only.
  test('forgot password gives the same answer for a registered and an unknown address', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'rate-limited endpoint: exercised once per run');
    const answers: string[] = [];
    for (const email of [`qa.noone.${Date.now()}@trackspense.qa`, 'qa.other.unknown@trackspense.qa']) {
      await page.goto('/forgot-password');
      await dismissCookieConsent(page);
      await page.getByLabel('Email').fill(email);
      await page.getByRole('button', { name: /send|reset/i }).first().click();
      const status = page.getByRole('status');
      await expect(status).toBeVisible({ timeout: 15_000 });
      answers.push((await status.innerText()).trim());
    }
    expect(answers[0]).toBe(answers[1]);
    expect(answers[0]).toContain("If that email is registered");
  });

  test('the reset page without a token says the link is missing its token', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('alert').filter({ hasText: 'missing its reset token' })).toBeVisible();
  });

  test('a bad reset token is refused with a generic message and mismatched passwords are caught first', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'rate-limited endpoint: exercised once per run');
    await page.goto('/reset-password?token=not-a-real-token');
    await dismissCookieConsent(page);
    await page.getByLabel(/^New Password/).fill('Another-Passw0rd!');
    await page.getByLabel(/^Confirm New Password/).fill('Different-Passw0rd!');
    await page.getByRole('button', { name: 'Reset Password' }).click();
    await expect(page.getByRole('alert')).toContainText('Passwords do not match');

    await page.getByLabel(/^Confirm New Password/).fill('Another-Passw0rd!');
    await page.getByRole('button', { name: 'Reset Password' }).click();
    await expect(page.getByRole('alert')).toContainText('invalid or has expired', { timeout: 15_000 });
  });

  test('an invalid email-verification link shows an error, not a success', async ({ page }) => {
    await page.goto('/verify-email?token=not-a-real-token');
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(/verified/i, { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/invalid|expired|couldn|link/i);
  });

  test('a verification page with no token is an error straight away', async ({ page }) => {
    await page.goto('/verify-email');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/invalid|expired|couldn|link|missing/i);
  });
});

// B-16 (part): assistant (MCP) pages must not exist while MCP is off (decision D-03, 2026-11-22).
test.describe('assistant pages when MCP is off (UI) @regression', () => {
  test('connect, approve and manage pages show the 404 page', async ({ page, request }) => {
    const config = await request.get(`${env.API_BASE_URL}/api/v1/config`).then((r) => r.json());
    test.skip(!!config.mcp_enabled, 'MCP is enabled in this environment');
    for (const route of ['/account/assistants', '/ai/connect/abc123', '/ai/approve/abc123']) {
      await page.goto(route);
      await expect(page.getByText('Page not found')).toBeVisible({ timeout: 15_000 });
    }
    await page.goto('/account');
    await expect(page.getByRole('link', { name: 'Connected assistants' })).toHaveCount(0);
  });
});
