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
    // Visible matches only: at phone width the first DOM match for '$25.00' is a hidden
    // "you're owed $25.00" caption, which made this fail on mobile-iphone only.
    await expect(page.getByText("You're owed").filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('$25.00').filter({ visible: true }).first()).toBeVisible();
  });

  test('a group with no expenses reads "settled up"', async ({ page, primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`ui_settled_${uniqueSuffix()}`) });
    // A second (name-only) member: a group of one deliberately shows "Add members to start
    // splitting" instead of a balance (GroupBalancesPanel's `solo` case), and the Balances
    // disclosure only renders for groups with more than one member.
    const res = await primaryApi.post(`/api/v1/groups/${group.group_id}/members`, { data: { display_name: 'QA Guest' } });
    expect(res.ok(), await res.text()).toBeTruthy();

    const groups = new GroupsPage(page);
    await groups.goto();
    await groups.openGroup(group.name);
    // The disclosure's one-line summary is the settled-state wording at every width (it's
    // collapsed by default at lg+, expanded below). "You're all settled up" is no longer a
    // reliable target: the desktop side panel shows it only once someone shares an expense,
    // and the copy in the group header is mobile-only.
    await expect(page.getByRole('button', { name: /^Balances/ })).toContainText('Everyone is settled up', { timeout: 15_000 });
  });
});
