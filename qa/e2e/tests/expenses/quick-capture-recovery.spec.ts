import { test, expect } from '../../fixtures/auth.fixture';
import { QuickCapturePanel } from '../../pages/QuickCapturePanel';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { MOBILE_VIEWPORT_MAX_WIDTH, dismissCookieConsent } from '../../helpers/responsive.helper';

// Backlog B-02/B-03/B-04 (docs/qa/06-automation-strategy.md): the duplicate-write and
// lost-draft protections in AGENTS.md ("Expense draft recovery") had logic/Jest tests only.
// Desktop-only: the amount text field these use doesn't exist in the phone keypad layout.
test.describe('Quick Capture write protection (UI) @regression @critical', () => {
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= MOBILE_VIEWPORT_MAX_WIDTH, 'desktop-only interaction pattern');
    await page.goto('/dashboard');
    await dismissCookieConsent(page);
  });

  test('B-02 a double-click on Save creates exactly one expense', async ({ page, primaryApi }) => {
    const description = qaLabel(`dbl_click_${uniqueSuffix()}`);
    const panel = new QuickCapturePanel(page);
    await panel.openViaAddExpenseButton();
    await panel.fillAmount('7.00');
    await panel.fillDescription(description);

    await panel.saveButton.dblclick();
    await panel.expectSavedConfirmation();

    const rows = await primaryApi.listExpenses({ search: description });
    const matches = JSON.stringify(rows).split(description).length - 1;
    expect(matches, 'one saved row (the description appears once in the listing)').toBe(1);
  });

  test('B-03 a dropped connection shows the unknown-outcome guard and never retries on its own', async ({ page }) => {
    const description = qaLabel(`net_fail_${uniqueSuffix()}`);
    let postAttempts = 0;
    await page.route('**/api/v1/expenses', async (route) => {
      if (route.request().method() === 'POST') {
        postAttempts += 1;
        await route.abort('connectionreset');
      } else {
        await route.continue();
      }
    });

    const panel = new QuickCapturePanel(page);
    await panel.openViaAddExpenseButton();
    await panel.fillAmount('8.00');
    await panel.fillDescription(description);
    await panel.save();

    await expect(page.getByRole('alert').filter({ hasText: 'The save outcome is unknown' })).toBeVisible({ timeout: 15_000 });
    // Save is blocked until the person confirms they checked Expenses...
    await expect(panel.saveButton).toBeDisabled();
    // ...and the app didn't replay the financial write by itself.
    await page.waitForTimeout(1500);
    expect(postAttempts).toBe(1);

    await page.getByRole('button', { name: /I checked Expenses/ }).click();
    await expect(panel.saveButton).toBeEnabled();
  });

  test('B-04 an unsaved draft survives a reload and can be discarded', async ({ page }, testInfo) => {
    const description = qaLabel(`draft_${uniqueSuffix()}`);
    const panel = new QuickCapturePanel(page);
    await panel.openViaAddExpenseButton();
    await panel.fillAmount('9.50');
    await panel.fillDescription(description);

    // The browser's "Leave site?" guard fires for a dirty sheet. Accept it to reload.
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => { dialogs.push(dialog.type()); void dialog.accept(); });
    await page.reload();
    // Only Chromium reports the "Leave site?" prompt to automation; Firefox and WebKit skip it.
    if (testInfo.project.name === 'chromium') expect(dialogs).toContain('beforeunload');
    await dismissCookieConsent(page);

    // The app may reopen the sheet by itself after a reload; open it only if it is not showing.
    await page.waitForTimeout(1500);
    if (!(await panel.descriptionField.isVisible())) await panel.openViaAddExpenseButton();
    await expect(page.getByText('Your unsaved expense was restored')).toBeVisible();
    await expect(panel.amountField).toHaveValue('9.50');
    await expect(panel.descriptionField).toHaveValue(description);

    // Discard asks first; cancelling keeps the draft, confirming clears it.
    await page.getByRole('button', { name: 'Discard draft' }).click();
    await page.getByRole('dialog', { name: /Discard this expense/ }).getByRole('button', { name: 'Cancel' }).click();
    await expect(panel.descriptionField).toHaveValue(description);

    await page.getByRole('button', { name: 'Discard draft' }).click();
    await page.getByRole('dialog', { name: /Discard this expense/ }).getByRole('button', { name: 'Discard' }).click();

    await panel.openViaAddExpenseButton();
    await expect(page.getByText('Your unsaved expense was restored')).toHaveCount(0);
    await expect(panel.descriptionField).toHaveValue('');
  });
});
