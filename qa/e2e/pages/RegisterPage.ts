import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class RegisterPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  async register(opts: { name: string; email: string; password: string; phone?: string }): Promise<void> {
    // Not getByLabel('Name', { exact: true }): these fields are `required`, so MUI renders the
    // label as "Name *" (asterisk in an aria-hidden span) and an exact label-text match never
    // resolves. That hung this flow until the test timeout on every run. Anchored regexes
    // match the label text with or without the asterisk.
    await this.page.getByLabel(/^Name\b/).fill(opts.name);
    await this.page.getByLabel(/^Email\b/).fill(opts.email);
    if (opts.phone) await this.page.getByLabel(/phone/i).fill(opts.phone);
    await this.page.getByLabel(/^Password\b/).fill(opts.password);
    await this.page.getByRole('button', { name: /create account/i }).click();
  }

  async expectErrorMessage(textPattern: string | RegExp): Promise<void> {
    await expect(this.page.getByText(textPattern)).toBeVisible({ timeout: 10_000 });
  }
}
