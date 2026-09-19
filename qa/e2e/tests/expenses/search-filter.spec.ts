import { test, expect } from '../../fixtures/auth.fixture';
import { ExpensesPage } from '../../pages/ExpensesPage';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';

test.describe('expenses search @regression', () => {
  test('exact and partial description search both find the row', async ({ page, primaryApi }) => {
    const suffix = uniqueSuffix();
    const description = qaLabel(`search_target_${suffix}`);
    const created = await primaryApi.createExpense({ description });

    const expenses = new ExpensesPage(page);
    await expenses.goto();

    await expenses.search(description);
    await expenses.expectRowVisible(description);

    await expenses.search(`search_target_${suffix}`.slice(0, 10));
    await expenses.expectRowVisible(description);

    await primaryApi.deleteExpense(created.row_id);
  });

  test('a search with no matches shows the empty/no-results state, not stale rows', async ({ page }) => {
    const expenses = new ExpensesPage(page);
    await expenses.goto();
    await expenses.search(`QA_E2E_no_such_expense_${Date.now()}_zzz`);
    await expect(page.locator('[data-testid="expense-row"]')).toHaveCount(0, { timeout: 10_000 });
  });

  test('special characters in the search box do not error the page', async ({ page }) => {
    const expenses = new ExpensesPage(page);
    await expenses.goto();
    await expenses.search('$%^&*()"\'<script>');
    // No crash / no unhandled error boundary — just an empty (or unaffected) result set.
    await expect(page.getByText('Something broke')).toHaveCount(0);
  });

  test('clearing the search restores the full list', async ({ page, primaryApi }) => {
    const description = qaLabel(`search_clear_${uniqueSuffix()}`);
    const created = await primaryApi.createExpense({ description });

    const expenses = new ExpensesPage(page);
    await expenses.goto();
    await expenses.search('a search term that matches nothing at all 12345');
    await expenses.expectRowHidden(description);

    await expenses.search('');
    await expenses.expectRowVisible(description);

    await primaryApi.deleteExpense(created.row_id);
  });
});
