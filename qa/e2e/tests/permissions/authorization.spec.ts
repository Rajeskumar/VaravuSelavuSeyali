import { test, expect } from '../../fixtures/auth.fixture';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';

test.describe('unauthenticated access is blocked @regression @permissions', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ['/dashboard', '/expenses', '/groups', '/analysis', '/account']) {
    test(`${route} redirects to /login when logged out`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });
  }
});

test.describe('data isolation between accounts @regression @permissions', () => {
  test('one user\'s personal expenses never appear in another user\'s list', async ({ page, primaryApi, secondaryApi }) => {
    const secondaryOnly = qaLabel(`secondary_only_${uniqueSuffix()}`);
    const created = await secondaryApi.createExpense({ description: secondaryOnly });

    await page.goto('/expenses');
    await page.getByPlaceholder('Search expenses').fill(secondaryOnly);
    await expect(page.locator('[data-testid="expense-row"]')).toHaveCount(0, { timeout: 10_000 });

    await secondaryApi.deleteExpense(created.row_id);
  });
});
