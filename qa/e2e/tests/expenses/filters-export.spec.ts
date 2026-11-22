import { test, expect } from '../../fixtures/auth.fixture';
import { ExpensesPage } from '../../pages/ExpensesPage';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { getPublicConfig } from '../../helpers/api.helper';
import { MOBILE_VIEWPORT_MAX_WIDTH, dismissCookieConsent } from '../../helpers/responsive.helper';
import * as fs from 'fs';

// Backlog B-09 (UAT-EXP-013/017/018). Month filter is a URL parameter (?month=YYYY-MM), so these
// are deterministic; data is created through the API with two QA-tagged expenses in different months.
function mdy(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

test.describe('expense filters, bulk tags and CSV (UI) @regression', () => {
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= MOBILE_VIEWPORT_MAX_WIDTH, 'desktop layout');
  });

  async function twoMonths(primaryApi: any) {
    const now = new Date();
    const earlier = new Date(now); earlier.setDate(earlier.getDate() - 40); // always a different month
    const current = qaLabel(`filter_now_${uniqueSuffix()}`);
    const old = qaLabel(`filter_old_${uniqueSuffix()}`);
    await primaryApi.createExpense({ description: current, date: mdy(now), cost: 11 });
    await primaryApi.createExpense({ description: old, date: mdy(earlier), cost: 22 });
    return { current, old, nowKey: monthKey(now), earlierKey: monthKey(earlier) };
  }

  test('the month filter shows only that month, and All time shows both', async ({ page, primaryApi }) => {
    const { current, old, nowKey, earlierKey } = await twoMonths(primaryApi);
    const expenses = new ExpensesPage(page);

    await page.goto(`/expenses?month=${nowKey}`);
    await dismissCookieConsent(page);
    await expenses.search(current.slice(0, -6)); // shared QA prefix narrows the list
    await expenses.expectRowVisible(current);
    await expenses.expectRowHidden(old);

    await page.goto(`/expenses?month=${earlierKey}`);
    await expenses.search(old);
    await expenses.expectRowVisible(old);
    await expenses.expectRowHidden(current);

    await page.goto('/expenses');
    await expenses.search(old);
    await expenses.expectRowVisible(old);
    await expenses.search(current);
    await expenses.expectRowVisible(current);
  });

  test('Export CSV follows the month filter and neutralises formulas', async ({ page, primaryApi }) => {
    const now = new Date();
    const earlier = new Date(now); earlier.setDate(earlier.getDate() - 40);
    const current = qaLabel(`csv_now_${uniqueSuffix()}`);
    const old = qaLabel(`csv_old_${uniqueSuffix()}`);
    await primaryApi.createExpense({ description: current, date: mdy(now), cost: 5 });
    await primaryApi.createExpense({ description: old, date: mdy(earlier), cost: 6 });
    await primaryApi.createExpense({ description: `=SUM(1+1) ${qaLabel('formula')}`, date: mdy(now), cost: 7 });

    await page.goto(`/expenses?month=${monthKey(now)}`);
    await dismissCookieConsent(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export month (CSV)' }).click(),
    ]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    expect(csv).toContain(current);
    expect(csv).not.toContain(old);
    // A cell that starts with "=" must not reach the spreadsheet as a formula.
    expect(csv).not.toMatch(/(^|,)"?=SUM/m);
    expect(csv.split('\n')[0].toLowerCase()).toContain('description');
  });

  test('bulk tag then untag two expenses in select mode', async ({ page, primaryApi }) => {
    const config = await getPublicConfig();
    test.skip(!config.tags_enabled, 'TAGS_ENABLED is off');
    const a = qaLabel(`bulk_a_${uniqueSuffix()}`);
    const b = qaLabel(`bulk_b_${uniqueSuffix()}`);
    await primaryApi.createExpense({ description: a, cost: 3 });
    await primaryApi.createExpense({ description: b, cost: 4 });
    const tag = `qa-bulk-${uniqueSuffix()}`.replace('_', '-');

    const expenses = new ExpensesPage(page);
    await expenses.goto();
    await dismissCookieConsent(page);
    await expenses.search(qaLabel('bulk_').slice(0, -1));
    await expenses.expectRowVisible(a);
    await expenses.expectRowVisible(b);

    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('checkbox', { name: `Select ${a}` }).check();
    await page.getByRole('checkbox', { name: `Select ${b}` }).check();
    await expect(page.getByText(/2 selected/)).toBeVisible();

    await page.getByRole('button', { name: 'Tag', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Choose one or more tags to apply' });
    await dialog.getByText('+ Add tag').click();
    await dialog.getByPlaceholder('Add a tag').fill(tag);
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });

    const tagged = async () => {
      const body = await primaryApi.listExpenses();
      return (body.items || []).filter((e: any) => [a, b].includes(e.description) && (e.tags || []).some((t: any) => t.name === tag)).length;
    };
    await expect.poll(tagged, { timeout: 10_000 }).toBe(2);

    // Untag again (select mode may have closed after applying).
    if (!(await page.getByText(/\d+ selected/).isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Select', exact: true }).click();
    }
    await page.getByRole('checkbox', { name: `Select ${a}` }).check();
    await page.getByRole('checkbox', { name: `Select ${b}` }).check();
    await page.getByRole('button', { name: 'Untag', exact: true }).click();
    const removeDialog = page.getByRole('dialog').filter({ hasText: 'Choose one or more tags to remove' });
    await removeDialog.getByText('+ Add tag').click();
    await removeDialog.getByPlaceholder('Add a tag').fill(tag);
    await page.keyboard.press('Enter');
    await removeDialog.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(tagged, { timeout: 10_000 }).toBe(0);
  });
});
