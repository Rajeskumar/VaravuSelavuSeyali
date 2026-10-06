import { test, expect } from '../../fixtures/auth.fixture';
import { dismissCookieConsent, expectNoHorizontalScroll } from '../../helpers/responsive.helper';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { getPublicConfig } from '../../helpers/api.helper';

/**
 * Regression coverage for the 2026-10-05 mobile-responsive review (M-01..M-09). Runs at a fixed
 * 375×812 phone viewport in any project (so `qa:regression` on chromium catches it without the
 * mobile-iphone project). Everything is read-only against the UI except records created through
 * the API with QA labels; nothing here logs in or registers, so the auth rate-limit budget is
 * untouched.
 */
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

const APP_BAR_FALLBACK = 56;

async function openCapture(page: import('@playwright/test').Page) {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await dismissCookieConsent(page);
  await page.getByRole('button', { name: 'Add Expense' }).first().click();
  await expect(page.getByTestId('quick-capture-description')).toBeVisible();
}

test.describe('amount entry (M-01) @regression', () => {
  test('the amount is a labelled input and the keypad keys are real buttons', async ({ page }) => {
    await openCapture(page);
    const amount = page.getByRole('textbox', { name: 'Amount' });
    await expect(amount).toBeVisible();
    await expect(amount).toHaveAttribute('inputmode', 'decimal');

    // Real <button>s: focusable and operable from the keyboard, with names a screen reader reads.
    for (const name of ['1', '5', '9', '0', 'Decimal point', 'Backspace']) {
      const key = page.getByRole('button', { name, exact: true });
      await expect(key).toBeVisible();
      expect(await key.evaluate((e) => e.tagName)).toBe('BUTTON');
    }
    await page.getByRole('button', { name: '7', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(amount).toHaveValue('7');
    await page.keyboard.press('Space');
    await expect(amount).toHaveValue('77');

    await amount.fill('12.5');
    await expect(amount).toHaveValue('12.5');
  });

  test('a negative amount is rejected with a message', async ({ page }) => {
    await openCapture(page);
    const amount = page.getByRole('textbox', { name: 'Amount' });
    await amount.fill('-5');
    await expect(amount).toHaveValue('');
    await expect(page.getByRole('alert').filter({ hasText: "Amounts can't be negative" })).toBeVisible();
  });
});

test.describe('sheets and the app bar (M-02) @regression', () => {
  test('the expense detail sheet sits below the app bar and its close button is a full-size target', async ({ page, primaryApi }) => {
    const { description } = await primaryApi.createExpense({ description: qaLabel(`m02_${uniqueSuffix()}`) });
    await page.goto('/expenses');
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent(page);
    await page.getByText(description).first().click();

    const sheet = page.locator('.MuiDrawer-modal .MuiDrawer-paper').first();
    await expect(sheet).toBeVisible();
    const headerBottom = await page.evaluate((fb) => document.querySelector('header')?.getBoundingClientRect().bottom ?? fb, APP_BAR_FALLBACK);
    const top = (await sheet.boundingBox())!.y;
    expect(top, 'sheet slid under the fixed app bar').toBeGreaterThanOrEqual(headerBottom);

    const close = sheet.getByRole('button', { name: 'close' }).first();
    const box = (await close.boundingBox())!;
    expect(box.y, 'close button hidden behind the app bar').toBeGreaterThanOrEqual(headerBottom);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('the new-expense sheet is also capped below the app bar', async ({ page }) => {
    await openCapture(page);
    const sheet = page.locator('.MuiDrawer-modal .MuiDrawer-paper').first();
    const headerBottom = await page.evaluate((fb) => document.querySelector('header')?.getBoundingClientRect().bottom ?? fb, APP_BAR_FALLBACK);
    expect((await sheet.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom);
  });
});

test.describe('groups on a phone (M-03, M-04, M-09) @regression', () => {
  test.beforeAll(async () => {
    const config = await getPublicConfig();
    test.skip(!config.groups_enabled, 'GROUPS_ENABLED is off in this environment — see qa/README.md.');
  });

  async function groupWithGuests(primaryApi: any) {
    const group = await primaryApi.createGroup({ name: qaLabel(`m03_${uniqueSuffix()}`) });
    for (const n of ['QA Guest One', 'QA Guest Two']) {
      const res = await primaryApi.post(`/api/v1/groups/${group.group_id}/members`, { data: { display_name: n } });
      expect(res.ok(), await res.text()).toBeTruthy();
    }
    return group;
  }

  test('member actions stay inside the settings dialog (nothing clipped)', async ({ page, primaryApi }) => {
    const group = await groupWithGuests(primaryApi);
    await page.goto(`/groups/${group.group_id}`);
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent(page);
    await page.getByRole('button', { name: 'Group settings' }).click();
    const dialog = page.locator('.MuiDialog-paper').last();
    await expect(dialog.getByRole('button', { name: /^Remove/ }).first()).toBeVisible();

    const clipped = await dialog.evaluate((d) => {
      const r = d.getBoundingClientRect();
      return [...d.querySelectorAll('button')]
        .filter((b) => (b as HTMLElement).offsetParent)
        .filter((b) => b.getBoundingClientRect().right > r.right + 1 || b.getBoundingClientRect().left < r.left - 1)
        .map((b) => (b.textContent || '').trim());
    });
    expect(clipped, 'buttons spilling out of the dialog').toEqual([]);
  });

  test('every split method is reachable inside the viewport', async ({ page, primaryApi }) => {
    const group = await groupWithGuests(primaryApi);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent(page);
    await page.getByRole('button', { name: 'Add Expense' }).first().click();
    await page.getByTestId(`who-chip-${group.group_id}`).click();
    await page.getByRole('button', { name: 'equally' }).click();

    for (const label of ['Equal', 'Exact', 'Percentage', 'Shares', 'Adjustment']) {
      const tab = page.getByRole('button', { name: label, exact: true });
      await expect(tab).toBeVisible();
      const box = (await tab.boundingBox())!;
      expect(box.x + box.width, `"${label}" runs past the phone edge`).toBeLessThanOrEqual(375);
    }
  });

  test('a settled group opens with Balances collapsed and a quiet "Record a payment" action', async ({ page, primaryApi }) => {
    const group = await groupWithGuests(primaryApi);
    await page.goto(`/groups/${group.group_id}`);
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent(page);
    const balances = page.getByRole('button', { name: /^Balances/ });
    await expect(balances).toHaveAttribute('aria-expanded', 'false');
    await expect(balances).toContainText('Everyone is settled up');
    await expect(page.getByRole('button', { name: 'Settle up', exact: true })).toHaveCount(0);
    await balances.click();
    await expect(page.getByRole('button', { name: 'Record a payment' })).toBeVisible();
    await expectNoHorizontalScroll(page, 'settled group');
  });
});

test.describe('floating Add button (M-05) @regression', () => {
  test('it hides while scrolling down to read and returns on scroll-up', async ({ page, primaryApi }) => {
    // Enough rows that the dashboard / feed actually scrolls.
    for (let i = 0; i < 6; i++) await primaryApi.createExpense({ description: qaLabel(`m05_${i}_${uniqueSuffix()}`) });
    await page.goto('/expenses');
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent(page);
    const fab = page.locator('button[aria-label="Add Expense"].MuiFab-root');
    await expect(fab).toBeVisible();

    await page.mouse.wheel(0, 900);
    await expect(fab).toBeHidden();
    await page.mouse.wheel(0, -300);
    await expect(fab).toBeVisible();
  });
});

test.describe('touch targets and inputs (M-06, M-08) @regression', () => {
  test('the dashboard scope toggle is at least 44px tall on a phone', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent(page);
    const toggle = page.getByRole('button', { name: /^I paid$/ }).first();
    await expect(toggle).toBeVisible();
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    // 44px hit area: the invisible ::after on every segment.
    const hit = await toggle.evaluate((e) => getComputedStyle(e, '::after').height);
    expect(parseFloat(hit)).toBeGreaterThanOrEqual(44);
  });

  test('Profile phone is a tel field', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    const phone = page.getByLabel('Phone (optional)');
    await expect(phone).toHaveAttribute('type', 'tel');
    await expect(phone).toHaveAttribute('inputmode', 'tel');
  });

  test('the AI chat composer is 16px on a phone', async ({ page }) => {
    await page.goto('/ask');
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent(page);
    const input = page.getByRole('textbox', { name: 'Ask about your spending' });
    await expect(input).toBeVisible();
    expect(await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  });

  test('native controls follow the colour mode (dark date picker icon)', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent(page);
    const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    const before = await scheme();
    await page.getByRole('button', { name: 'Toggle color mode' }).click();
    const after = await scheme();
    expect(['light', 'dark']).toContain(before);
    expect(['light', 'dark']).toContain(after);
    expect(after).not.toBe(before);
  });
});
