import { Page, expect } from '@playwright/test';

/** Shared navigation/assertion helpers every page object can use. */
export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  /** MUI Snackbar+Alert toast pattern used across the app (Expenses/Groups/Dashboard). */
  async expectToast(textPattern: string | RegExp): Promise<void> {
    await expect(this.page.getByRole('alert').filter({ hasText: textPattern }).or(
      this.page.getByText(textPattern),
    )).toBeVisible({ timeout: 10_000 });
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }
}
