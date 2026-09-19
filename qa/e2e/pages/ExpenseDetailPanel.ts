import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * The Dialog-hosted AddExpenseForm used for editing a row from ExpensesPage
 * (distinct from QuickCaptureSheet, which is create-only). MUI `TextField label=...`
 * gives reliable `getByLabelText` selectors here — see AddExpenseForm.tsx.
 */
export class ExpenseDetailPanel extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  get costField() {
    return this.page.getByLabel('Cost', { exact: true });
  }

  get descriptionField() {
    // Not getByLabel('Description') here — verified by direct DOM/AX-tree inspection that
    // this specific field's computed accessible name resolves to its placeholder text, not
    // its <label>, even though the label IS correctly `for`-associated in the DOM (confirmed
    // via input.labels). The sibling Cost field works because it sets an explicit
    // `aria-label="Cost"`; this one doesn't. Likely a real accessibility gap, not just a
    // test-selector inconvenience — see qa/TEST-PLAN.md's defect log. Using the added
    // data-testid rather than the placeholder text so this doesn't silently start matching
    // the wrong thing if the placeholder copy ever changes.
    return this.page.getByTestId('expense-form-description');
  }

  get dateField() {
    return this.page.locator('input[type="date"]');
  }

  get updateButton() {
    return this.page.getByRole('button', { name: 'Update Expense' });
  }

  async setCost(cost: string): Promise<void> {
    await this.costField.fill(cost);
  }

  async setDescription(description: string): Promise<void> {
    await this.descriptionField.fill(description);
  }

  async submit(): Promise<void> {
    await this.updateButton.click();
  }

  async expectVisible(): Promise<void> {
    await expect(this.costField).toBeVisible({ timeout: 10_000 });
  }
}
