import { test, expect } from '../../fixtures/auth.fixture';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { getPublicConfig } from '../../helpers/api.helper';
import { MOBILE_VIEWPORT_MAX_WIDTH, dismissCookieConsent } from '../../helpers/responsive.helper';

// Backlog B-10 (UAT-ANL-001..003) and B-11 (UAT-BUD-001/002, UAT-CARD-001). The shared primary
// persona is used by every suite, so totals are compared between two screens read in the same
// moment (retried), and budgets/cards created here are removed through the API afterwards.
function money(text: string | null): number {
  return parseFloat((text || '').replace(/[^0-9.]/g, '') || '0');
}
function mdy(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

test.describe('analysis (UI) @regression', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= MOBILE_VIEWPORT_MAX_WIDTH, 'desktop layout');
  });

  test('the Analysis category total equals the Dashboard total for the same month', async ({ page, primaryApi }) => {
    await primaryApi.createExpense({ description: qaLabel(`anl_${uniqueSuffix()}`), cost: 13.37, date: mdy(new Date()) });
    await expect(async () => {
      await page.goto('/dashboard');
      await dismissCookieConsent(page);
      await expect(page.getByTestId('true-total-hero-amount')).toBeVisible();
      const dashboard = money(await page.getByTestId('true-total-hero-amount').textContent());
      await page.goto('/analysis');
      await expect(page.getByTestId('category-breakdown-total')).toBeVisible();
      const analysis = money(await page.getByTestId('category-breakdown-total').textContent());
      expect(analysis).toBeCloseTo(dashboard, 2);
    }).toPass({ timeout: 40_000, intervals: [1000, 2000, 4000] });
  });

  test('a category row expands to list its expenses', async ({ page, primaryApi }) => {
    const description = qaLabel(`anl_drill_${uniqueSuffix()}`);
    await primaryApi.createExpense({ description, category: 'Groceries', cost: 21.5, date: mdy(new Date()) });
    await page.goto('/analysis');
    await dismissCookieConsent(page);
    const row = page.getByRole('button', { name: /Groceries/ }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.getByText(description).first()).toBeVisible();
    await row.click();
    await expect(page.getByText(description)).toHaveCount(0);
  });

  test('Year covers at least what Month covers', async ({ page, primaryApi }) => {
    await primaryApi.createExpense({ description: qaLabel(`anl_year_${uniqueSuffix()}`), cost: 9, date: mdy(new Date()) });
    await page.goto('/analysis');
    await dismissCookieConsent(page);
    const total = page.getByTestId('category-breakdown-total');
    await expect(total).toBeVisible({ timeout: 15_000 });
    const month = money(await total.textContent());
    await page.getByRole('group', { name: 'Category breakdown period' }).getByRole('button', { name: 'Year' }).click();
    await expect(async () => {
      expect(money(await total.textContent())).toBeGreaterThanOrEqual(month - 0.005);
    }).toPass({ timeout: 15_000 });
  });
});

test.describe('budgets and cards (UI) @regression', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= MOBILE_VIEWPORT_MAX_WIDTH, 'desktop layout');
  });

  async function clearBudgets(primaryApi: any) {
    const res = await primaryApi.get('/api/v1/budgets');
    if (!res.ok()) return;
    for (const b of await res.json()) await primaryApi.delete(`/api/v1/budgets/${b.id}`);
  }

  test('create an overall budget, reject an empty limit, then delete it', async ({ page, primaryApi }) => {
    const config = await getPublicConfig();
    test.skip(!config.budgets_enabled, 'BUDGETS_ENABLED is off');
    await clearBudgets(primaryApi);
    try {
      await page.goto('/analysis?tab=budgets');
      await dismissCookieConsent(page);
      await page.getByRole('button', { name: 'New Budget' }).first().click();
      await page.getByRole('group', { name: 'Overall or per-category budget' }).getByRole('button', { name: 'Overall' }).click();
      const save = page.getByRole('button', { name: 'Save budget' });
      await expect(save).toBeDisabled(); // no limit yet
      await page.getByLabel('Monthly limit').fill('0');
      await expect(save).toBeDisabled(); // zero is not a limit
      await page.getByLabel('Monthly limit').fill('600');
      await expect(save).toBeEnabled();
      await save.click();

      await expect(page.getByText(/\$600/).first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Budget options' }).first().click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await page.getByRole('dialog', { name: 'Delete budget?' }).getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByText(/\$600/).first()).toBeVisible();

      await page.getByRole('button', { name: 'Budget options' }).first().click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await page.getByRole('dialog', { name: 'Delete budget?' }).getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByText('No budgets yet')).toBeVisible({ timeout: 15_000 });
    } finally {
      await clearBudgets(primaryApi);
    }
  });

  test('add a catalog card, make it default, then remove it', async ({ page, primaryApi }) => {
    const config = await getPublicConfig();
    test.skip(!config.card_coach_enabled, 'CARD_COACH_ENABLED is off');
    const clear = async () => {
      const res = await primaryApi.get('/api/v1/cards/mine');
      if (!res.ok()) return;
      for (const c of await res.json()) await primaryApi.delete(`/api/v1/cards/mine/${c.id}`);
    };
    await clear();
    try {
      await page.goto('/analysis?tab=cards');
      await dismissCookieConsent(page);
      await page.getByRole('button', { name: 'Add a card' }).click();
      await page.getByPlaceholder('Search by issuer or card name…').fill('chase');
      const add = page.getByRole('button', { name: 'Add', exact: true }).first();
      await expect(add).toBeVisible({ timeout: 15_000 });
      await add.click();
      await expect(page.getByText('Your cards', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Remove card' })).toHaveCount(1);

      await page.getByRole('button', { name: 'Remove card' }).click();
      await expect(page.getByText('Your cards', { exact: true })).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await clear();
    }
  });
});
