import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../pages/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { ExpensesPage } from '../../pages/ExpensesPage';
import { ExpenseDetailPanel } from '../../pages/ExpenseDetailPanel';
import { QA_USERS } from '../../fixtures/users.fixture';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { MOBILE_VIEWPORT_MAX_WIDTH } from '../../helpers/responsive.helper';

// Starts logged out — this suite exercises the real login flow, not just an authenticated page.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The application's single most critical path: load → log in → dashboard → create an
 * expense → see it → edit it → see the change → delete it → see it gone → log out.
 * Tagged @smoke @critical: this must stay fast (a few minutes) and must stay green —
 * a red smoke suite blocks a release (see CI in .github/workflows/qa.yml). `npm run
 * qa:smoke` only ever runs this against `chromium` (desktop) — it uses
 * `quick-capture-amount`, QuickCaptureSheet's desktop-only text field, so it self-skips
 * if it's ever run at mobile width instead (e.g. `npx playwright test --project=mobile-iphone`
 * unfiltered): the mobile keypad equivalent is covered by
 * responsive-mobile.spec.ts's "amount entry bounds" tests.
 */
test.describe('golden path @smoke @critical', () => {
  test('log in, create/edit/delete an expense, and log out', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= MOBILE_VIEWPORT_MAX_WIDTH, 'desktop-only interaction pattern');

    // This journey chains ~9 real steps against a live backend + frontend, each with its
    // own page load/network round trip — the global 60s default (right for a
    // single-behavior test) cuts it close. Verified locally at ~8-25s against a warm CRA
    // dev server; this leaves real headroom for a colder CI runner without masking a
    // genuine hang.
    test.setTimeout(90_000);

    const login = new LoginPage(page);
    const dashboard = new DashboardPage(page);
    const expenses = new ExpensesPage(page);
    const detail = new ExpenseDetailPanel(page);

    await test.step('application loads and login succeeds', async () => {
      await login.loginAndWaitForDashboard(QA_USERS.primary.email, QA_USERS.primary.password);
      await dashboard.expectLoaded();
    });

    const description = qaLabel(`smoke_${uniqueSuffix()}`);
    const updatedDescription = `${description}_edited`;

    await test.step('create an expense via Quick Capture', async () => {
      await expenses.goto();
      await expenses.addExpenseButton.click();
      await expect(page.getByTestId('quick-capture-description')).toBeVisible();
      await page.getByTestId('quick-capture-amount').fill('19.99');
      await page.getByTestId('quick-capture-description').fill(description);
      await page.getByTestId('quick-capture-save').click();
      await expect(page.getByText(/Logged to/)).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Done' }).click();
    });

    await test.step('the expense appears in the list', async () => {
      await expenses.goto();
      await expenses.search(description);
      await expenses.expectRowVisible(description);
    });

    await test.step('dashboard total updates after creation', async () => {
      await dashboard.goto();
      await dashboard.expectLoaded();
      // Just needs to reflect *some* value once the new expense is included — the exact-total
      // assertion lives in dashboard.spec.ts against a fully deterministic seed.
      await expect(dashboard.totalAmount).toBeVisible();
    });

    await test.step('edit the expense', async () => {
      await expenses.goto();
      await expenses.search(description);
      await expenses.editRow(description);
      await detail.expectVisible();
      await detail.setDescription(updatedDescription);
      await detail.setCost('24.99');
      await detail.submit();
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
    });

    await test.step('the change is visible', async () => {
      await expenses.goto();
      await expenses.search(updatedDescription);
      await expenses.expectRowVisible(updatedDescription);
    });

    await test.step('delete the expense', async () => {
      await expenses.deleteRow(updatedDescription);
      await expenses.confirmDelete();
    });

    await test.step('the expense is gone', async () => {
      await expenses.goto();
      await expenses.search(updatedDescription);
      await expenses.expectRowHidden(updatedDescription);
    });

    await test.step('log out', async () => {
      await page.goto('/account');
      await page.getByRole('button', { name: 'Log out' }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });
  });
});
