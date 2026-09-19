import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async login(email: string, password: string): Promise<void> {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    // The header also carries a standalone "Login" button, so scope to the form's submit.
    await this.page.locator('form button[type="submit"]').click();
  }

  async loginAndWaitForDashboard(email: string, password: string): Promise<void> {
    await this.goto();
    await this.login(email, password);
    await this.page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  }

  async expectErrorMessage(textPattern: string | RegExp): Promise<void> {
    await expect(this.page.getByText(textPattern)).toBeVisible({ timeout: 10_000 });
  }

  get emailField() {
    return this.page.getByLabel(/email/i);
  }

  get passwordField() {
    return this.page.getByLabel(/password/i);
  }

  get submitButton() {
    return this.page.locator('form button[type="submit"]');
  }
}
