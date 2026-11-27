import { test, expect } from '../../fixtures/auth.fixture';
import { QuickCapturePanel } from '../../pages/QuickCapturePanel';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { MOBILE_VIEWPORT_MAX_WIDTH, dismissCookieConsent } from '../../helpers/responsive.helper';
import { GroupsPage } from '../../pages/GroupsPage';
import { createTripGroup, storedExpense, storedShares } from '../../helpers/group-money.helper';

// Backlog B-07 / UAT-RCPT-001..006 (docs/qa/06-automation-strategy.md). Runs against the backend's
// `OCR_ENGINE=mock`, which "reads" the upload as plain text — so a fixture is just a PNG signature
// (the API checks the magic bytes) followed by receipt lines in the mock's format.
// Desktop-only: the amount text field and item card layout these assert are the desktop variant.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function recentIso(daysAgo = 3): string {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function receiptPng(merchant: string, lines: string[], subtotal: string, extra: string[] = []): { name: string; mimeType: string; buffer: Buffer } {
  const text = [`Merchant: ${merchant}`, `Date: ${recentIso()}`, ...lines, ...extra, `Subtotal: ${subtotal}`].join('\n');
  return { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.concat([PNG_MAGIC, Buffer.from('\n' + text + '\n')]) };
}

const TWO_ITEMS = ['1. Oat Milk qty 1 ea price 4.00 total 4.00', '2. Sourdough qty 1 ea price 6.00 total 6.00'];

test.describe('receipt scan (UI) @regression', () => {
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= MOBILE_VIEWPORT_MAX_WIDTH, 'desktop-only layout');
    await page.goto('/dashboard');
    await dismissCookieConsent(page);
  });

  /** Picks a file through the hidden scan input and answers the one-time AI-consent dialog. */
  async function scan(page: any, panel: QuickCapturePanel, file: { name: string; mimeType: string; buffer: Buffer }) {
    await panel.openViaAddExpenseButton();
    await page.locator('input[type="file"]').first().setInputFiles(file);
    const allow = page.getByRole('button', { name: 'Allow AI features' });
    await allow.click({ timeout: 4000 }).catch(() => undefined);
  }

  /** For tests that need the scan to SUCCEED. The parse endpoint allows 3 requests a minute per
   * IP, and every browser project in a run shares one IP — so a parallel worker's scans (including
   * the rejection tests below, which still count) can use up the window first. That's the limit
   * doing its job, not a product failure: wait out the window and pick the file again. */
  async function scanUntilParsed(page: any, panel: QuickCapturePanel, file: { name: string; mimeType: string; buffer: Buffer }) {
    test.setTimeout(180_000);
    await scan(page, panel, file);
    const items = page.getByText(/\d+ items? scanned/);
    const failed = page.getByText('Failed to parse receipt');
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(items.or(failed)).toBeVisible({ timeout: 20_000 });
      if (await items.isVisible()) return;
      await page.waitForTimeout(61_000);
      await page.locator('input[type="file"]').first().setInputFiles(file);
      // The previous error stays up until the new parse starts; don't mistake it for the result.
      await expect(failed).toBeHidden({ timeout: 10_000 });
    }
    await expect(items).toBeVisible({ timeout: 20_000 });
  }

  /** Answers the parse call in the browser with the same two-item draft the mock engine returns,
   * for tests about the dialog rather than parsing — no rate-limit dependency. Cross-origin, so the
   * preflight and the response both carry CORS headers. */
  async function stubParse(page: any, merchant: string) {
    await page.route('**/api/v1/ingest/receipt/parse**', async (route: any) => {
      const origin = route.request().headers()['origin'] || '*';
      const cors = {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const item = (line_no: number, item_name: string, line_total: number) => ({
        line_no, item_name, normalized_name: item_name, quantity: 1, unit: 'ea', unit_price: line_total, line_total, category_name: 'Groceries',
      });
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({
          header: {
            merchant_name: merchant, normalized_merchant_name: merchant, merchant_name_raw: merchant, purchased_at: `${recentIso()}T12:00:00`,
            currency: 'USD', amount: 10, tax: 0, tip: 0, discount: 0, description: 'Receipt import',
            main_category_name: 'Food & Drink', category_name: 'Groceries',
          },
          items: [item(1, 'Oat Milk', 4), item(2, 'Sourdough', 6)],
          warnings: [],
          fingerprint: `stub-${merchant}`,
          source: 'ocr',
          confidence: 1,
        }),
      });
    });
  }

  test('scanning fills the amount, shows the items, and saves one itemized expense', async ({ page, primaryApi }) => {
    const merchant = qaLabel(`store_${uniqueSuffix()}`);
    const panel = new QuickCapturePanel(page);
    await scanUntilParsed(page, panel, receiptPng(merchant, TWO_ITEMS, '10.00'));

    await expect(page.getByText('2 items scanned')).toBeVisible({ timeout: 20_000 });
    await expect(panel.amountField).toHaveValue('10');
    await expect(page.getByRole('status').filter({ hasText: 'Matches total' })).toBeVisible();

    const description = qaLabel(`receipt_${uniqueSuffix()}`);
    await panel.fillDescription(description);
    await panel.save();
    await panel.expectSavedConfirmation();

    const body = await primaryApi.listExpenses();
    const rows = (body.items || []).filter((e: any) => e.description === description);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].cost)).toBeCloseTo(10, 2);
    expect(rows[0].item_count).toBe(2);
  });

  test('editing an item so the lines no longer match the total warns and blocks Save until fixed', async ({ page }) => {
    // A short window makes the dialog taller than the screen. TS-QA-101: the dialog paper is a
    // flex column, and the items card (overflow:hidden, so min-height 0) used to be the item that
    // shrank — collapsing to its 2px border and hiding every line. CI first saw it only after
    // earlier suites had added group chips; a short window reproduces it on any run, with no
    // real receipt scan — the parse response is stubbed (the endpoint allows 3 per minute).
    await page.setViewportSize({ width: 1280, height: 520 });
    const merchant = qaLabel(`store_${uniqueSuffix()}`);
    await stubParse(page, merchant);
    const panel = new QuickCapturePanel(page);
    await scan(page, panel, receiptPng(merchant, TWO_ITEMS, '10.00'));
    await expect(page.getByText('2 items scanned')).toBeVisible({ timeout: 20_000 });
    const card = page.getByRole('button', { name: /2 items scanned/ }).locator('..');
    expect((await card.boundingBox())?.height ?? 0).toBeGreaterThan(100);
    await panel.fillDescription(qaLabel(`receipt_${uniqueSuffix()}`));
    await expect(panel.saveButton).toBeEnabled();

    // Remove one item: the remaining lines no longer add up to the $10 total.
    await page.getByRole('button', { name: 'Remove Oat Milk' }).click();
    const status = page.getByRole('status').filter({ hasText: 'less than the total' });
    await expect(status).toBeVisible();
    await expect(status).toContainText('Make them match to save');
    await expect(panel.saveButton).toBeDisabled();

    // Bringing the total in line with the remaining item re-enables Save.
    await panel.fillAmount('6');
    await expect(page.getByRole('status').filter({ hasText: 'Matches total' })).toBeVisible();
    await expect(panel.saveButton).toBeEnabled();
  });

  // TS-FIX-102 (S-25): the real scan folds a whole-receipt discount into the paid line prices, and a
  // group receipt is split on its TOTAL (Equal by default) — shares equal the amount to the cent.
  test('a group receipt with a discount saves paid prices and splits the total equally', async ({ page, primaryApi }) => {
    const trip = await createTripGroup(primaryApi, 'receipt_split');
    const groups = new GroupsPage(page);
    await groups.openDetail(trip.id);
    await groups.openAddExpense();
    const panel = new QuickCapturePanel(page);
    await page.locator('input[type="file"]').first().setInputFiles(receiptPng(qaLabel(`store_${uniqueSuffix()}`), [
      '1. Steak qty 1 ea price 20.00 total 20.00', '2. Wine qty 1 ea price 10.00 total 10.00',
    ], '27.00', ['Discount: 3.00']));
    await page.getByRole('button', { name: 'Allow AI features' }).click({ timeout: 4000 }).catch(() => undefined);
    test.setTimeout(180_000);
    await expect(page.getByText('2 items scanned')).toBeVisible({ timeout: 80_000 });
    await expect(page.getByLabel('Price paid for Steak')).toHaveValue('18');
    await expect(page.getByLabel('Price paid for Wine')).toHaveValue('9');
    await expect(page.getByRole('status').filter({ hasText: 'Matches total' })).toBeVisible();

    const description = qaLabel(`receipt_split_${uniqueSuffix()}`);
    await panel.fillDescription(description);
    await panel.save();
    await panel.expectSavedConfirmation();

    const expense = await storedExpense(primaryApi, trip.id, description);
    expect(expense.has_items).toBe(true);
    expect(expense.split_type).toBe('equal');
    expect(Object.values(storedShares(expense)).sort()).toEqual([900, 900, 900]);
    const items = await (await primaryApi.get(`/api/v1/groups/${trip.id}/expenses/${expense.row_id}/items`)).json();
    expect(items.items.map((i: any) => [i.line_total, i.discount, i.original_price])).toEqual([[18, 2, 20], [9, 1, 10]]);
  });

  test('a file that is not an image or PDF is refused with a message', async ({ page }) => {
    const panel = new QuickCapturePanel(page);
    await panel.openViaAddExpenseButton();
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByText('Unsupported file type')).toBeVisible({ timeout: 10_000 });
  });

  test('an image whose bytes are not really an image is rejected by the server', async ({ page }) => {
    const panel = new QuickCapturePanel(page);
    await scan(page, panel, { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png at all') });
    await expect(page.getByText('Failed to parse receipt')).toBeVisible({ timeout: 20_000 });
    // The form stays usable: typing the expense by hand still works.
    await panel.fillAmount('3.00');
    await expect(panel.amountField).toHaveValue('3.00');
  });

  test('an oversized upload is rejected and does not break the form', async ({ page }) => {
    const panel = new QuickCapturePanel(page);
    const big = Buffer.concat([PNG_MAGIC, Buffer.alloc(13 * 1024 * 1024, 0x20)]); // over the 12 MB limit
    await scan(page, panel, { name: 'huge.png', mimeType: 'image/png', buffer: big });
    await expect(page.getByText('Failed to parse receipt')).toBeVisible({ timeout: 30_000 });
    await expect(panel.descriptionField).toBeVisible();
  });
});
