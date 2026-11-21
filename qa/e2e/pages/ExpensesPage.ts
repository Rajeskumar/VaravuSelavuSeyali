import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** Accessible names of the expense-entry button: desktop header vs mobile FAB. */
export const ADD_EXPENSE_BUTTON_NAME = /^(new expense|add expense)$/i;

/** The visible expense-entry button on any page and viewport — see ExpensesPage.addExpenseButton. */
export function addExpenseButton(page: Page): Locator {
  return page.getByRole('button', { name: ADD_EXPENSE_BUTTON_NAME }).last();
}

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
   * The app's expense-entry button, which is named differently per viewport: desktop shows
   * the header's "New expense" button (App.tsx, hidden below `md`), mobile shows the
   * "Add Expense" FAB (MainLayout.tsx, mobile-only). Exactly one is visible at any width and
   * role queries skip hidden elements, so this resolves to a single button either way.
   * `.last()` is kept only as a guard against a future layout rendering both again (the FAB
   * comes later in DOM order). Matching only "Add Expense" broke every desktop run once the
   * header button was renamed (the old note here described a header/FAB duplication that
   * no longer exists).
   */
  get addExpenseButton(): Locator {
    return addExpenseButton(this.page);
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
