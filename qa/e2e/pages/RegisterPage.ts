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
    await this.page.getByLabel('Name', { exact: true }).fill(opts.name);
    await this.page.getByLabel('Email', { exact: true }).fill(opts.email);
    if (opts.phone) await this.page.getByLabel(/phone/i).fill(opts.phone);
    await this.page.getByLabel('Password', { exact: true }).fill(opts.password);
    await this.page.getByRole('button', { name: /create account/i }).click();
  }

  async expectErrorMessage(textPattern: string | RegExp): Promise<void> {
    await expect(this.page.getByText(textPattern)).toBeVisible({ timeout: 10_000 });
  }
}
