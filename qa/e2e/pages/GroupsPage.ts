import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class GroupsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/groups');
  }

  get createGroupButton() {
    return this.page.getByRole('button', { name: 'Create Group' }).first();
  }

  get createDialog() {
    return this.page.getByRole('dialog');
  }

  async createGroup(name: string): Promise<void> {
    await this.createGroupButton.click();
    await this.createDialog.getByLabel('Name').fill(name);
    await this.createDialog.getByRole('button', { name: 'Create' }).click();
  }

  /**
   * `.first()`: a just-created group is auto-selected, so its name renders twice at once
   * — once in the left rail's list entry, once as the detail pane's own heading. Both
   * confirm the same thing ("this group exists and is visible"), so matching either is
   * enough; without `.first()` this is a strict-mode violation.
   */
  groupInRail(name: string) {
    return this.page.getByText(name, { exact: true }).first();
  }

  async openGroup(name: string): Promise<void> {
    await this.groupInRail(name).click();
  }

  async expectGroupVisible(name: string): Promise<void> {
    await expect(this.groupInRail(name)).toBeVisible({ timeout: 15_000 });
  }

  get addMemberButton() {
    return this.page.getByRole('button', { name: 'Add Member' });
  }
}
