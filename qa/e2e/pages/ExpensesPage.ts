import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ExpensesPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/expenses');
    await expect(this.searchInput).toBeVisible({ timeout: 15_000 });
  }

  get searchInput(): Locator {
    return this.page.getByPlaceholder('Search expenses');
  }

  get monthSelect(): Locator {
    return this.page.getByLabel('Month');
  }

  /**
   * On this page specifically (not Dashboard, which correctly shows only one), narrow
   * viewports render BOTH the desktop header's text button AND a floating "+" FAB
   * simultaneously — both named "Add Expense", both `display:flex`/visible at once, a
   * real UI redundancy confirmed via direct DOM inspection (see TEST-PLAN.md §7e).
   * `.last()`: the FAB consistently renders after the header button in DOM order, and is
   * the only one present at all when there's no duplication (desktop) — so this picks
   * the right one either way without depending on which viewport is active.
   */
  get addExpenseButton(): Locator {
    return this.page.getByRole('button', { name: 'Add Expense' }).last();
  }

  get exportCsvButton(): Locator {
    return this.page.getByRole('button', { name: /export csv/i });
  }

  async search(text: string): Promise<void> {
    await this.searchInput.fill(text);
  }

  /** One feed row for a given expense description — waits for it to appear (post-create). */
  row(description: string): Locator {
    return this.page.locator('[data-testid="expense-row"]', { hasText: description });
  }

  async expectRowVisible(description: string): Promise<void> {
    await expect(this.row(description)).toBeVisible({ timeout: 15_000 });
  }

  async expectRowHidden(description: string): Promise<void> {
    await expect(this.row(description)).toHaveCount(0, { timeout: 15_000 });
  }

  async openRow(description: string): Promise<void> {
    await this.row(description).click();
  }

  /** Hover-revealed row actions — must hover the row first or the icon buttons are inactionable. */
  async editRow(description: string): Promise<void> {
    const target = this.row(description);
    await target.hover();
    await target.getByRole('button', { name: 'edit' }).click();
  }

  async deleteRow(description: string): Promise<void> {
    const target = this.row(description);
    await target.hover();
    await target.getByRole('button', { name: 'delete' }).click();
  }

  async confirmDelete(): Promise<void> {
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Delete expense?' });
    await dialog.getByRole('button', { name: 'Delete' }).click();
  }
}
