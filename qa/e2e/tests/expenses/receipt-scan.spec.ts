import { test, expect } from '../../fixtures/auth.fixture';
import { QuickCapturePanel } from '../../pages/QuickCapturePanel';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { MOBILE_VIEWPORT_MAX_WIDTH, dismissCookieConsent } from '../../helpers/responsive.helper';

// Backlog B-07 / UAT-RCPT-001..006 (docs/qa/06-automation-strategy.md). Runs against the backend's
// `OCR_ENGINE=mock`, which "reads" the upload as plain text — so a fixture is just a PNG signature
// (the API checks the magic bytes) followed by receipt lines in the mock's format.
// Desktop-only: the amount text field and item card layout these assert are the desktop variant.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function recentIso(daysAgo = 3): string {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function receiptPng(merchant: string, lines: string[], subtotal: string): { name: string; mimeType: string; buffer: Buffer } {
  const text = [`Merchant: ${merchant}`, `Date: ${recentIso()}`, ...lines, `Subtotal: ${subtotal}`].join('\n');
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

  test('scanning fills the amount, shows the items, and saves one itemized expense', async ({ page, primaryApi }) => {
    const merchant = qaLabel(`store_${uniqueSuffix()}`);
    const panel = new QuickCapturePanel(page);
    await scan(page, panel, receiptPng(merchant, TWO_ITEMS, '10.00'));

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
    const panel = new QuickCapturePanel(page);
    await scan(page, panel, receiptPng(qaLabel(`store_${uniqueSuffix()}`), TWO_ITEMS, '10.00'));
    await expect(page.getByText('2 items scanned')).toBeVisible({ timeout: 20_000 });
    await panel.fillDescription(qaLabel(`receipt_${uniqueSuffix()}`));
    await expect(panel.saveButton).toBeEnabled();

    // Remove one item: the remaining lines no longer add up to the $10 total.
    await page.getByRole('button', { name: 'Remove item' }).first().click();
    const status = page.getByRole('status').filter({ hasText: 'more than the expense total' }).or(page.getByRole('status').filter({ hasText: 'less than the expense total' }));
    await expect(status).toBeVisible();
    await expect(status).toContainText('Fix an item or the total to save');
    await expect(panel.saveButton).toBeDisabled();

    // Bringing the total in line with the remaining item re-enables Save.
    await panel.fillAmount('6');
    await expect(page.getByRole('status').filter({ hasText: 'Matches total' })).toBeVisible();
    await expect(panel.saveButton).toBeEnabled();
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
