import { test, expect } from '../../fixtures/auth.fixture';
import { GroupsPage } from '../../pages/GroupsPage';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { getPublicConfig } from '../../helpers/api.helper';

test.describe('groups (UI) @regression', () => {
  test.beforeAll(async () => {
    const config = await getPublicConfig();
    test.skip(!config.groups_enabled, 'GROUPS_ENABLED is off in this environment — see qa/README.md.');
  });

  test('a new group can be created and appears in the rail', async ({ page }) => {
    const groups = new GroupsPage(page);
    const name = qaLabel(`ui_group_${uniqueSuffix()}`);
    await groups.goto();
    await groups.createGroup(name);
    await groups.expectGroupVisible(name);
  });

  test('a group expense created via the API shows up in the group detail feed', async ({ page, primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`ui_group_expense_${uniqueSuffix()}`) });
    const [me] = await primaryApi.listGroupMembers(group.group_id);
    const description = qaLabel(`ui_group_line_${uniqueSuffix()}`);
    await primaryApi.createGroupExpense(group.group_id, {
      amount: 40,
      payers: [{ member_id: me.member_id, amount_paid: 40 }],
      split: { type: 'equal', entries: [{ member_id: me.member_id }] },
      description,
    });

    const groups = new GroupsPage(page);
    await groups.goto();
    await groups.openGroup(group.name);
    await expect(page.getByText(description)).toBeVisible({ timeout: 15_000 });
  });
});
