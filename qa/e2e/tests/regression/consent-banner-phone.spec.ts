import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Backlog B-01 / UAT-RESP-002 (F-01). Every other responsive test starts with the cookie
// banner already answered, which is how it covered the phone nav and Add button unnoticed.
// This one logs in with the saved session cookies only (no stored consent) at 390x844.
const state = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../auth/primary.json'), 'utf8'));
// Keep cookies and the app's own session markers; drop only the consent answer.
const origins = (state.origins ?? []).map((o: any) => ({
  ...o,
  localStorage: (o.localStorage ?? []).filter((e: any) => !/consent/i.test(e.name)),
}));

test.describe('cookie banner on a phone (UI) @regression @critical', () => {
  test.use({ storageState: { cookies: state.cookies, origins }, viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the banner does not cover the bottom nav or the Add button, and both work unanswered', async ({ page }) => {
    await page.goto('/dashboard');
    const banner = page.getByRole('region', { name: 'Cookie consent' });
    await expect(banner).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Primary' });
    const fab = page.getByRole('button', { name: 'Add Expense' });
    await expect(nav).toBeVisible();
    await expect(fab).toBeVisible();

    const [b, n, f] = await Promise.all([banner.boundingBox(), nav.boundingBox(), fab.boundingBox()]);
    const overlaps = (a: any, c: any) => a.y < c.y + c.height && c.y < a.y + a.height;
    expect(overlaps(b!, n!), 'banner overlaps bottom nav').toBe(false);
    expect(overlaps(b!, f!), 'banner overlaps Add button').toBe(false);

    // Real clicks (Playwright fails if another element intercepts them).
    await fab.click();
    await expect(page.getByTestId('keypad-1')).toBeVisible({ timeout: 10_000 });
  });

  test('the bottom nav is reachable while the banner is still showing', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('region', { name: 'Cookie consent' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Primary' }).getByText('Expenses').click();
    await expect(page).toHaveURL(/\/expenses/);
  });
});
