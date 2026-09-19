import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AccountSettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/account');
  }

  get nameField() {
    return this.page.getByLabel('Name', { exact: true });
  }

  get saveButton() {
    return this.page.getByRole('button', { name: /save changes/i });
  }

  get logoutButton() {
    return this.page.getByRole('button', { name: 'Log out' });
  }

  async updateName(name: string): Promise<void> {
    await this.nameField.fill(name);
    await this.saveButton.click();
  }

  async expectSuccessToast(): Promise<void> {
    await expect(this.page.getByText('Profile updated')).toBeVisible({ timeout: 10_000 });
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
  }
}
