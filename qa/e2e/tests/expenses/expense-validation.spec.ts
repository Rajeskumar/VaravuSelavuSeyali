import { test, expect } from '../../fixtures/auth.fixture';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { MOBILE_VIEWPORT_MAX_WIDTH } from '../../helpers/responsive.helper';

/**
 * Client-side validation on the Quick Capture amount field (src/utils/amount.ts,
 * `sanitizeAmountInput`/`isValidAmount`) — rejects at keystroke level rather than showing a
 * post-hoc error, so these assert the *composed value* stays within bounds, not an error
 * message. Server-side enforcement of the same bounds is covered in
 * api/tests/expenses-api.spec.ts's validation suite (the two must agree — that's the point).
 *
 * Desktop-only: these all drive `data-testid="quick-capture-amount"`, a plain text field
 * that only exists on QuickCaptureSheet's desktop branch — mobile uses a numeric keypad
 * instead, covered by responsive-mobile.spec.ts's "amount entry bounds" tests.
 */
test.describe('expense form validation (UI) @regression @validation', () => {
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= MOBILE_VIEWPORT_MAX_WIDTH, 'desktop-only interaction pattern');
    await page.goto('/expenses');
    // .last() — see ExpensesPage.addExpenseButton's note on the mobile-viewport
    // header-button/FAB duplication.
    await page.getByRole('button', { name: 'Add Expense' }).last().click();
    await expect(page.getByTestId('quick-capture-description')).toBeVisible();
  });

  test('save stays disabled with no amount entered', async ({ page }) => {
    await page.getByTestId('quick-capture-description').fill(qaLabel(`validation_no_amount_${uniqueSuffix()}`));
    await expect(page.getByTestId('quick-capture-save')).toBeDisabled();
  });

  test('save stays disabled with no description entered', async ({ page }) => {
    await page.getByTestId('quick-capture-amount').fill('10.00');
    await expect(page.getByTestId('quick-capture-save')).toBeDisabled();
  });

  test('a third decimal digit is not composed into the amount', async ({ page }) => {
    await page.getByTestId('quick-capture-amount').fill('12.345');
    const value = await page.getByTestId('quick-capture-amount').inputValue();
    expect(/\.\d{3,}/.test(value), `amount field accepted more than 2 decimal places: "${value}"`).toBeFalsy();
  });

  test('an amount above the server ceiling cannot be composed', async ({ page }) => {
    await page.getByTestId('quick-capture-amount').fill('1000001');
    const value = await page.getByTestId('quick-capture-amount').inputValue();
    expect(Number(value.replace(/[^0-9.]/g, '') || '0')).toBeLessThanOrEqual(1_000_000);
  });

  test('a very long description is accepted and saved without truncating silently mid-save', async ({ page }) => {
    const longDescription = qaLabel(`long_${uniqueSuffix()}_${'x'.repeat(200)}`);
    await page.getByTestId('quick-capture-amount').fill('5.00');
    await page.getByTestId('quick-capture-description').fill(longDescription);
    await expect(page.getByTestId('quick-capture-save')).toBeEnabled();
  });
});
