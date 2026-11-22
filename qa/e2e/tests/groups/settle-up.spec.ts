import { test, expect } from '../../fixtures/auth.fixture';
import { GroupsPage } from '../../pages/GroupsPage';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { getPublicConfig } from '../../helpers/api.helper';
import { QA_USERS } from '../../fixtures/users.fixture';
import { dismissCookieConsent } from '../../helpers/responsive.helper';

// Backlog B-06 / UAT-GRP-008 (docs/qa/06-automation-strategy.md). Settle-up moves real balances
// between people and had only a component test + API tests. Product rule (2026-11-22): partial and
// over-payment are both allowed.
test.describe('settle up (UI) @regression @critical', () => {
  test.beforeAll(async () => {
    const config = await getPublicConfig();
    test.skip(!config.groups_enabled, 'GROUPS_ENABLED is off in this environment — see qa/README.md.');
  });

  async function groupWhereSecondaryOwes25(primaryApi: any) {
    const group = await primaryApi.createGroup({ name: qaLabel(`ui_settle_${uniqueSuffix()}`) });
    await primaryApi.addMemberByEmail(group.group_id, QA_USERS.secondary.email);
    // Pick members by email: the list's order is not guaranteed.
    const members = await primaryApi.listGroupMembers(group.group_id);
    const me = members.find((m: any) => m.user_email === QA_USERS.primary.email);
    const other = members.find((m: any) => m.user_email === QA_USERS.secondary.email);
    await primaryApi.createGroupExpense(group.group_id, {
      amount: 50,
      payers: [{ member_id: me.member_id, amount_paid: 50 }],
      split: { type: 'equal', entries: [{ member_id: me.member_id }, { member_id: other.member_id }] },
      description: qaLabel(`ui_settle_expense_${uniqueSuffix()}`),
    });
    return group;
  }

  async function openSettleDialog(page: any, groupName: string) {
    const groups = new GroupsPage(page);
    await groups.goto();
    await dismissCookieConsent(page);
    await groups.openGroup(groupName);
    await page.getByRole('button', { name: 'Settle up', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Settle up' });
    await expect(dialog.getByText(/owes you \$25\.00/)).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Settle', exact: true }).click();
    return dialog;
  }

  test('settling the suggested amount brings the group back to settled up', async ({ page, primaryApi }) => {
    const group = await groupWhereSecondaryOwes25(primaryApi);
    const dialog = await openSettleDialog(page, group.name);

    await expect(dialog.getByLabel('Amount')).toHaveValue(/25(\.00)?/);
    await dialog.getByRole('button', { name: 'Record Settlement' }).click();
    await expect(dialog.getByText(/all square/)).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Done' }).click();

    await expect(page.getByRole('button', { name: /^Balances/ })).toContainText('Everyone is settled up', { timeout: 15_000 });
  });

  test('a partial payment says what is still owed', async ({ page, primaryApi }) => {
    const group = await groupWhereSecondaryOwes25(primaryApi);
    const dialog = await openSettleDialog(page, group.name);

    await dialog.getByLabel('Amount').fill('10');
    await dialog.getByRole('button', { name: 'Record Settlement' }).click();
    await expect(dialog.getByText(/still owes \$15\.00/)).toBeVisible({ timeout: 15_000 });
  });

  test('paying more than is owed is allowed and says the balance flipped', async ({ page, primaryApi }) => {
    const group = await groupWhereSecondaryOwes25(primaryApi);
    const dialog = await openSettleDialog(page, group.name);

    await dialog.getByLabel('Amount').fill('30');
    await dialog.getByRole('button', { name: 'Record Settlement' }).click();
    await expect(dialog.getByText(/more than was owed/)).toBeVisible({ timeout: 15_000 });
  });
});
