import { test, expect } from '../../fixtures/auth.fixture';
import { GroupsPage } from '../../pages/GroupsPage';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { getPublicConfig } from '../../helpers/api.helper';
import { QA_USERS } from '../../fixtures/users.fixture';

test.describe('group balances (UI) @regression', () => {
  test.beforeAll(async () => {
    const config = await getPublicConfig();
    test.skip(!config.groups_enabled, 'GROUPS_ENABLED is off in this environment — see qa/README.md.');
  });

  test('fronting a group expense shows "You\'re owed" with the correct amount', async ({ page, primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`ui_balance_${uniqueSuffix()}`) });
    await primaryApi.addMemberByEmail(group.group_id, QA_USERS.secondary.email);
    const [me, other] = await primaryApi.listGroupMembers(group.group_id);

    // Primary fronts the whole $50, split equally — primary is owed $25 back.
    await primaryApi.createGroupExpense(group.group_id, {
      amount: 50,
      payers: [{ member_id: me.member_id, amount_paid: 50 }],
      split: { type: 'equal', entries: [{ member_id: me.member_id }, { member_id: other.member_id }] },
      description: qaLabel(`ui_balance_expense_${uniqueSuffix()}`),
    });

    const groups = new GroupsPage(page);
    await groups.goto();
    await groups.openGroup(group.name);

    // .first(): "You're owed" legitimately renders twice more as an sr-only caption
    // ("you're owed $25.00") elsewhere in the balances panel — all render the same
    // direction, so matching the first is enough to confirm it.
    await expect(page.getByText("You're owed").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('$25.00').first()).toBeVisible();
  });

  test('a group with no expenses reads "all settled up"', async ({ page, primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`ui_settled_${uniqueSuffix()}`) });

    const groups = new GroupsPage(page);
    await groups.goto();
    await groups.openGroup(group.name);
    await expect(page.getByText("You're all settled up")).toBeVisible({ timeout: 15_000 });
  });
});
