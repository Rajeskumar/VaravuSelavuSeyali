import { test, expect } from '@playwright/test';
import { env } from '../../helpers/env';

/**
 * The ONLY suite allowed to point at production (`PROD_BASE_URL`, via the `prod-smoke`
 * project — see playwright.config.ts). Strictly read-only by construction: no login, no
 * form submission, no API writes. `env.assertWritesAllowed()` (e2e/helpers/env.ts) is a
 * second, independent safeguard in case a write helper is ever called against a
 * non-local URL by mistake — this file just never calls one in the first place.
 *
 * Run with: npm run qa:prod-smoke
 */
test.describe('production read-only smoke @smoke @prod-safe', () => {
  test('homepage loads', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.ok(), 'homepage did not return 2xx').toBeTruthy();
    await expect(page).toHaveTitle(/TrackSpense/i);
  });

  test('login page renders the real login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeVisible();
    // Never filled in or submitted — this suite must never authenticate against prod.
  });

  test('backend health endpoint is up', async ({ request }) => {
    const res = await request.get(`${env.PROD_API_BASE_URL}/api/v1/healthz`);
    expect(res.ok()).toBeTruthy();
  });

  test('backend config endpoint reports feature flags', async ({ request }) => {
    const res = await request.get(`${env.PROD_API_BASE_URL}/api/v1/config`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('groups_enabled');
    expect(body).toHaveProperty('budgets_enabled');
  });

  test('unknown route renders the app 404, not a server error', async ({ page }) => {
    const res = await page.goto('/this-route-does-not-exist');
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });
});
