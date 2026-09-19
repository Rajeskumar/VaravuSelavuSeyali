import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * The "New expense" sheet (QuickCaptureSheet.tsx) — the app's one create-expense entry
 * point (FAB/header button everywhere). Renders as a centered dialog on desktop widths
 * (a plain amount TextField) and a bottom-sheet drawer with a numeric keypad on mobile
 * widths — both variants expose the same `data-testid`s added for this framework.
 */
export class QuickCapturePanel extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async openViaAddExpenseButton(): Promise<void> {
    // Two "Add Expense"-named buttons can coexist at narrow viewports on some pages
    // (header text button + FAB) — see ExpensesPage.addExpenseButton's identical note.
    await this.page.getByRole('button', { name: 'Add Expense' }).last().click();
    // Not getByText('New expense') — that text also matches the header's own "Add Expense"
    // button's accessible name in some layouts (strict-mode violation, caught by
    // verifying this framework end-to-end). The description field is unambiguous.
    await expect(this.descriptionField).toBeVisible({ timeout: 10_000 });
  }

  get amountField() {
    return this.page.getByTestId('quick-capture-amount');
  }

  get descriptionField() {
    return this.page.getByTestId('quick-capture-description');
  }

  get dateField() {
    return this.page.getByLabel('Date');
  }

  get saveButton() {
    return this.page.getByTestId('quick-capture-save');
  }

  whoChip(idOrSlug: 'me' | string) {
    return this.page.getByTestId(`who-chip-${idOrSlug}`);
  }

  keypadKey(key: string) {
    const slug = key === '⌫' ? 'backspace' : key === '.' ? 'decimal' : key;
    return this.page.getByTestId(`keypad-${slug}`);
  }

  /** Desktop only — the amount field is a plain text input there. */
  async fillAmount(amount: string): Promise<void> {
    await this.amountField.fill(amount);
  }

  /** Mobile only — desktop has no keypad, use fillAmount() instead. */
  async enterAmountViaKeypad(amount: string): Promise<void> {
    for (const char of amount) {
      await this.keypadKey(char).click();
    }
  }

  async fillDescription(description: string): Promise<void> {
    await this.descriptionField.fill(description);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async expectSavedConfirmation(): Promise<void> {
    await expect(this.page.getByText(/Logged to/)).toBeVisible({ timeout: 15_000 });
  }

  async closeSavedPanel(): Promise<void> {
    await this.page.getByRole('button', { name: 'Done' }).click();
  }
}
