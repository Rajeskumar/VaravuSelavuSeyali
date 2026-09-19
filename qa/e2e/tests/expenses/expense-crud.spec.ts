import { test, expect } from '../../fixtures/auth.fixture';
import { ExpensesPage } from '../../pages/ExpensesPage';
import { ExpenseDetailPanel } from '../../pages/ExpenseDetailPanel';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { MOBILE_VIEWPORT_MAX_WIDTH } from '../../helpers/responsive.helper';

test.describe('expense CRUD (UI) @regression @critical', () => {
  test('create via Quick Capture, then edit its cost and description', async ({ page }) => {
    // QuickCaptureSheet's `quick-capture-amount` text field only exists on its desktop
    // branch — mobile drives the same flow via the numeric keypad instead (covered by
    // responsive-mobile.spec.ts's "amount entry bounds" tests, which also exercise Save).
    test.skip((page.viewportSize()?.width ?? 0) <= MOBILE_VIEWPORT_MAX_WIDTH, 'desktop-only interaction pattern');

    const expenses = new ExpensesPage(page);
    const detail = new ExpenseDetailPanel(page);
    const description = qaLabel(`ui_crud_${uniqueSuffix()}`);

    await expenses.goto();
    await expenses.addExpenseButton.click();
    await page.getByTestId('quick-capture-amount').fill('12.00');
    await page.getByTestId('quick-capture-description').fill(description);
    await page.getByTestId('quick-capture-save').click();
    await expect(page.getByText(/Logged to/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Done' }).click();

    await expenses.goto();
    await expenses.search(description);
    await expenses.expectRowVisible(description);

    const updated = `${description}_v2`;
    await expenses.editRow(description);
    await detail.expectVisible();
    await detail.setDescription(updated);
    await detail.setCost('30.00');
    await detail.submit();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });

    await expenses.goto();
    await expenses.search(updated);
    await expenses.expectRowVisible(updated);

    await expenses.deleteRow(updated);
    await expenses.confirmDelete();
    await expenses.goto();
    await expenses.search(updated);
    await expenses.expectRowHidden(updated);
  });

  test('delete can be cancelled without removing the row', async ({ page, primaryApi }) => {
    const description = qaLabel(`ui_cancel_delete_${uniqueSuffix()}`);
    const created = await primaryApi.createExpense({ description });

    const expenses = new ExpensesPage(page);
    await expenses.goto();
    await expenses.search(description);
    await expenses.deleteRow(description);
    await page.getByRole('dialog').filter({ hasText: 'Delete expense?' }).getByRole('button', { name: 'Cancel' }).click();

    await expenses.expectRowVisible(description);
    await primaryApi.deleteExpense(created.row_id);
  });

  test('an expense created via the API is visible and openable in the UI', async ({ page, primaryApi }) => {
    const description = qaLabel(`api_then_ui_${uniqueSuffix()}`);
    const created = await primaryApi.createExpense({ description, cost: 9.99, merchant_name: 'QA Test Merchant' });

    const expenses = new ExpensesPage(page);
    await expenses.goto();
    await expenses.search(description);
    // Tapping the row (as opposed to the hover edit icon) opens ExpenseDetailSheet, a
    // separate view/edit component from the edit-icon's AddExpenseForm dialog — its Amount
    // field is labeled "Amount", not "Cost".
    await expenses.openRow(description);
    const amountField = page.getByLabel('Amount', { exact: true });
    await expect(amountField).toBeVisible({ timeout: 10_000 });
    await expect(amountField).toHaveValue(/9\.99/);

    await page.keyboard.press('Escape');
    await primaryApi.deleteExpense(created.row_id);
  });
});
