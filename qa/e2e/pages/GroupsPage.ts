import { Page, Locator, expect } from '@playwright/test';
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
    // Visible matches only: at phone width, creating or opening a group navigates into its
    // detail view and the rail is hidden, so the first DOM match can be a hidden rail entry
    // while the same name is plainly visible in the detail header.
    return this.page.getByText(name, { exact: true }).filter({ visible: true }).first();
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

  /** Opens one group's detail view directly, with the cookie banner out of the way. */
  async openDetail(groupId: string): Promise<void> {
    await this.page.goto(`/groups/${groupId}`);
    const decline = this.page.getByRole('button', { name: 'Decline' });
    if (await decline.isVisible().catch(() => false)) await decline.click();
    await expect(this.page.getByRole('button', { name: 'Group settings' })).toBeVisible({ timeout: 15_000 });
  }

  /** The group page's own Add Expense button; it opens Quick Capture with this group selected. */
  async openAddExpense(): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Add Expense' }).filter({ visible: true }).first().click();
    const dialog = this.page.getByRole('dialog', { name: 'New expense' });
    // The "Paid by … split …" line appears once the group's members have loaded.
    await expect(dialog.getByText(/Paid by/)).toBeVisible({ timeout: 15_000 });
    return dialog;
  }

  /**
   * An expense row in the group feed. Matched by description: the amount in the row's accessible
   * name is the viewer's share, not the expense total. Descriptions must be unique, regex-safe labels.
   */
  expenseRow(description: string) {
    return this.page.getByRole('button', { name: new RegExp(`^${description}, `) });
  }

  /** Opens an expense's detail drawer by tapping its row. */
  async openExpense(description: string): Promise<Locator> {
    await this.expenseRow(description).click();
    const drawer = this.page.getByRole('dialog', { name: 'Group expense details' });
    await expect(drawer).toBeVisible();
    return drawer;
  }

  /** Opens the split picker from a "Paid by X and split Y" line. `current` is Y's present wording. */
  async openSplitPicker(scope: Locator, current = 'equally'): Promise<Locator> {
    await scope.getByRole('button', { name: current, exact: true }).click();
    const picker = this.page.getByRole('dialog', { name: 'Choose how to split' });
    await expect(picker).toBeVisible();
    return picker;
  }

  async openPayerPicker(scope: Locator, current = 'you'): Promise<Locator> {
    await scope.getByRole('button', { name: current, exact: true }).click();
    const picker = this.page.getByRole('dialog', { name: 'Choose payer' });
    await expect(picker).toBeVisible();
    return picker;
  }
}
