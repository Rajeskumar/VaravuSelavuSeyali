import { test, expect } from '../../fixtures/auth.fixture';
import { GroupsPage } from '../../pages/GroupsPage';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import type { AuthedApi } from '../../helpers/api.helper';
import { createTripGroup, storedExpense, storedShares, storedPayers, netBalances, cents, TripGroup } from '../../helpers/group-money.helper';
import type { Page } from '@playwright/test';

// TS-QA-105 / backlog A1: changing, removing, settling and moving group expenses through the web UI.
test.describe('group expense changes and settlements (UI) @regression @critical', () => {
  /** $100, deliberately uneven (60/25/15) and two payers (70/30): an edit that rebuilds either shows. */
  async function seedUneven(api: AuthedApi, label: string) {
    const group = await createTripGroup(api, label);
    const description = qaLabel(`${label}_${uniqueSuffix()}`);
    await api.createGroupExpense(group.id, {
      description,
      amount: 100,
      payers: [
        { member_id: group.me.id, amount_paid: 70 },
        { member_id: group.asha.id, amount_paid: 30 },
      ],
      split: {
        type: 'exact',
        entries: [
          { member_id: group.me.id, value: 60 },
          { member_id: group.asha.id, value: 25 },
          { member_id: group.ben.id, value: 15 },
        ],
      },
    });
    return { group, description, expense: await storedExpense(api, group.id, description) };
  }

  const unevenShares = (g: TripGroup) => ({ [g.me.id]: 6000, [g.asha.id]: 2500, [g.ben.id]: 1500 });
  const unevenPayers = (g: TripGroup) => ({ [g.me.id]: 7000, [g.asha.id]: 3000 });

  async function openDrawer(page: Page, groupId: string, description: string) {
    const groups = new GroupsPage(page);
    await groups.openDetail(groupId);
    return groups.openExpense(description);
  }

  test('renaming an expense leaves its payers and uneven split exactly as they were', async ({ page, primaryApi }) => {
    const { group, description, expense } = await seedUneven(primaryApi, 'ui_rename');
    const balancesBefore = await netBalances(primaryApi, group.id);
    const drawer = await openDrawer(page, group.id, description);
    await drawer.getByRole('button', { name: 'Edit expense' }).click();
    const renamed = `${description}_renamed`;
    await drawer.getByLabel('Description').fill(renamed);
    await drawer.getByRole('button', { name: 'Save', exact: true }).click();

    const after = await storedExpense(primaryApi, group.id, renamed);
    expect(cents(after.cost)).toBe(10000);
    expect(storedShares(after)).toEqual(unevenShares(group));
    expect(storedPayers(after)).toEqual(unevenPayers(group));
    // The same record, edited: no second copy, and nothing else about it moved.
    expect(await primaryApi.listGroupExpenses(group.id)).toHaveLength(1);
    expect(after).toMatchObject({ row_id: expense.row_id, date: expense.date, category: expense.category });
    expect(await netBalances(primaryApi, group.id)).toEqual(balancesBefore);

    // Saving closes the drawer; reopened, the change is visible in the expense's history.
    await expect(drawer).toBeHidden();
    const reopened = await new GroupsPage(page).openExpense(renamed);
    await reopened.getByRole('button', { name: /^History/ }).click();
    await expect(reopened.getByText(/edited this expense/)).toBeVisible({ timeout: 15_000 });
  });

  /** $90 split equally three ways, paid by me. */
  async function seedEqual(api: AuthedApi, label: string) {
    const group = await createTripGroup(api, label);
    const description = qaLabel(`${label}_${uniqueSuffix()}`);
    await api.createGroupExpense(group.id, {
      description,
      amount: 90,
      payers: [{ member_id: group.me.id, amount_paid: 90 }],
      split: { type: 'equal', entries: [group.me, group.asha, group.ben].map((m) => ({ member_id: m.id })) },
    });
    return { group, description };
  }

  // TS-FIX-103: an untouched split is left to the server, which rescales it.
  test('changing only the amount saves, and the stored equal split follows it', async ({ page, primaryApi }) => {
    const { group, description } = await seedEqual(primaryApi, 'ui_amount_kept');
    const drawer = await openDrawer(page, group.id, description);
    await drawer.getByRole('button', { name: 'Edit expense' }).click();
    await drawer.getByLabel('Amount').fill('120.45');
    await expect(drawer.getByText('The saved split and payments will adjust to the new total unless you change them.')).toBeVisible();
    await drawer.getByRole('button', { name: 'Save', exact: true }).click();

    await expect.poll(async () => cents((await storedExpense(primaryApi, group.id, description)).cost)).toBe(12045);
    const after = await storedExpense(primaryApi, group.id, description);
    expect(storedShares(after)).toEqual({ [group.me.id]: 4015, [group.asha.id]: 4015, [group.ben.id]: 4015 });
    expect(storedPayers(after)).toEqual({ [group.me.id]: 12045 });
    expect(after.split_type).toBe('equal');
  });

  test('a split the user set must be fixed after the amount changes, then stores the new shares', async ({ page, primaryApi }) => {
    const { group, description } = await seedEqual(primaryApi, 'ui_amount');
    const drawer = await openDrawer(page, group.id, description);
    await drawer.getByRole('button', { name: 'Edit expense' }).click();
    // Saving the picker makes the per-person amounts the user's own.
    const own = await new GroupsPage(page).openSplitPicker(drawer, 'unequally');
    await own.getByRole('button', { name: 'Save', exact: true }).click();
    await drawer.getByLabel('Amount').fill('120.45');
    const save = drawer.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled(); // the old per-person amounts no longer add up

    const picker = await new GroupsPage(page).openSplitPicker(drawer, 'unequally');
    await picker.getByRole('button', { name: 'Equal', exact: true }).click();
    await picker.getByRole('button', { name: 'Save', exact: true }).click();
    await save.click();

    await expect.poll(async () => cents((await storedExpense(primaryApi, group.id, description)).cost)).toBe(12045);
    const after = await storedExpense(primaryApi, group.id, description);
    expect(storedShares(after)).toEqual({ [group.me.id]: 4015, [group.asha.id]: 4015, [group.ben.id]: 4015 });
    expect(storedPayers(after)).toEqual({ [group.me.id]: 12045 });
    expect(await primaryApi.listGroupExpenses(group.id)).toHaveLength(1);
  });

  test('delete can be cancelled, and confirming it clears the balances', async ({ page, primaryApi }) => {
    const { group, description } = await seedUneven(primaryApi, 'ui_delete');
    const drawer = await openDrawer(page, group.id, description);
    await drawer.getByRole('button', { name: 'Delete expense' }).click();
    await drawer.getByRole('button', { name: 'Cancel' }).click();
    await expect(drawer.getByRole('button', { name: 'Delete expense' })).toBeVisible();
    expect(await primaryApi.listGroupExpenses(group.id)).toHaveLength(1);

    await drawer.getByRole('button', { name: 'Delete expense' }).click();
    await drawer.getByRole('button', { name: 'Confirm delete' }).click();
    await expect.poll(async () => (await primaryApi.listGroupExpenses(group.id)).length).toBe(0);
    expect(Object.values(await netBalances(primaryApi, group.id))).toEqual([0, 0, 0]);
  });

  // Phones hide the row's own delete button (delete is in the drawer, which has no Undo), so this
  // journey only exists at desktop width. Pinning the size keeps it running in every project.
  test.describe('delete from the list', () => {
    test.use({ viewport: { width: 1280, height: 720 }, hasTouch: false });

    test('Undo after deleting from the list restores the same payers and shares once', async ({ page, primaryApi }) => {
      const { group, description, expense } = await seedUneven(primaryApi, 'ui_undo');
      const before = await netBalances(primaryApi, group.id);
      await new GroupsPage(page).openDetail(group.id);
      await new GroupsPage(page).expenseRow(description).hover();
      await page.getByRole('button', { name: 'delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await expect.poll(async () => (await primaryApi.listGroupExpenses(group.id)).length).toBe(0);

      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(page.getByText('Expense restored')).toBeVisible({ timeout: 15_000 });
      const restored = await storedExpense(primaryApi, group.id, description);
      expect(await primaryApi.listGroupExpenses(group.id)).toHaveLength(1);
      expect(restored).toMatchObject({ cost: expense.cost, date: expense.date, category: expense.category });
      expect(storedShares(restored)).toEqual(unevenShares(group));
      expect(storedPayers(restored)).toEqual(unevenPayers(group));
      expect(await netBalances(primaryApi, group.id)).toEqual(before);
    });
  });

  test('a comment can be posted and removed', async ({ page, primaryApi }) => {
    const { group, description, expense } = await seedUneven(primaryApi, 'ui_comment');
    const drawer = await openDrawer(page, group.id, description);
    await drawer.getByPlaceholder('Add a comment...').fill('Paid in cash');
    await drawer.getByRole('button', { name: 'Post comment' }).click();
    await expect(drawer.getByText('Paid in cash')).toBeVisible({ timeout: 15_000 });
    const comments = await primaryApi.listExpenseComments(group.id, expense.row_id);
    expect(comments.map((c) => c.body)).toEqual(['Paid in cash']);

    await drawer.getByRole('button', { name: 'Delete comment' }).click();
    await expect(drawer.getByText('No comments yet.')).toBeVisible({ timeout: 15_000 });
    expect(await primaryApi.listExpenseComments(group.id, expense.row_id)).toHaveLength(0);
  });

  // Uneven shares, so paying anyone else's share would show; with two payers the app pays the larger one.
  const shareCases = [
    { title: 'one payer', ashaPaid: 90, benPaid: 0 },
    { title: 'two payers (pays the larger one)', ashaPaid: 60, benPaid: 30 },
  ];
  for (const { title, ashaPaid, benPaid } of shareCases) {
    test(`"Settle my share", ${title}: records exactly my share`, async ({ page, primaryApi }) => {
      const group = await createTripGroup(primaryApi, 'ui_myshare');
      const description = qaLabel(`my_share_${uniqueSuffix()}`);
      await primaryApi.createGroupExpense(group.id, {
        description,
        amount: 90,
        payers: [
          { member_id: group.asha.id, amount_paid: ashaPaid },
          ...(benPaid ? [{ member_id: group.ben.id, amount_paid: benPaid }] : []),
        ],
        split: {
          type: 'exact',
          entries: [
            { member_id: group.me.id, value: 45.15 },
            { member_id: group.asha.id, value: 29.85 },
            { member_id: group.ben.id, value: 15 },
          ],
        },
      });
      const before = await netBalances(primaryApi, group.id);

      const drawer = await openDrawer(page, group.id, description);
      await drawer.getByRole('button', { name: 'Settle my $45.15 share' }).click();
      await expect.poll(async () => (await primaryApi.listSettlements(group.id)).length).toBe(1);
      const [settlement] = await primaryApi.listSettlements(group.id);
      expect(settlement).toMatchObject({ from_member_id: group.me.id, to_member_id: group.asha.id });
      expect(cents(settlement.amount)).toBe(4515);
      expect(await netBalances(primaryApi, group.id)).toEqual({
        ...before,
        [group.me.id]: before[group.me.id] + 4515,
        [group.asha.id]: before[group.asha.id] - 4515,
      });
    });
  }

  test('a custom settlement between two other people is stored as entered', async ({ page, primaryApi }) => {
    const { group } = await seedUneven(primaryApi, 'ui_custom');
    const before = await netBalances(primaryApi, group.id);
    await new GroupsPage(page).openDetail(group.id);
    await page.getByRole('button', { name: 'Settle up', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Settle up' });
    await dialog.getByRole('button', { name: 'Record a custom settlement' }).click();

    async function choose(label: string, name: string) {
      await dialog.getByLabel(label).click();
      await page.getByRole('option', { name, exact: true }).click();
    }
    await choose('To (who received)', group.ben.name);
    await choose('From (who paid)', group.ben.name);
    await expect(dialog.getByText('"From" and "To" must be different people')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Record Settlement' })).toBeDisabled();

    await choose('To (who received)', group.asha.name);
    await dialog.getByLabel('Amount').fill('12.34');
    await dialog.getByRole('button', { name: 'Record Settlement' }).click();
    await expect(dialog.getByRole('button', { name: 'Done' })).toBeVisible({ timeout: 15_000 });

    const settlements = await primaryApi.listSettlements(group.id);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({ from_member_id: group.ben.id, to_member_id: group.asha.id });
    expect(cents(settlements[0].amount)).toBe(1234);
    expect(await netBalances(primaryApi, group.id)).toEqual({
      ...before,
      [group.ben.id]: before[group.ben.id] + 1234,
      [group.asha.id]: before[group.asha.id] - 1234,
    });
  });

  test('moving a personal expense into a group keeps one copy and splits it', async ({ page, primaryApi }) => {
    const group = await createTripGroup(primaryApi, 'ui_move');
    const { description, row_id } = await primaryApi.createExpense({ cost: 60, description: qaLabel(`move_${uniqueSuffix()}`) });

    await page.goto('/expenses');
    const decline = page.getByRole('button', { name: 'Decline' });
    if (await decline.isVisible().catch(() => false)) await decline.click();
    await page.getByPlaceholder(/search/i).fill(description);
    await page.locator('button.expense-row-main', { hasText: description }).click();
    await page.getByRole('dialog', { name: 'Expense details' }).getByRole('button', { name: 'Move to group…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Move to group' });
    await dialog.getByLabel('Group').click();
    await page.getByRole('option', { name: group.name, exact: true }).click();
    await expect(dialog.getByText('Split reconciles')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.getByText('Expense moved to group')).toBeVisible({ timeout: 15_000 });

    const moved = await storedExpense(primaryApi, group.id, description);
    expect(String(moved.row_id)).toBe(String(row_id)); // converted in place, not copied
    expect(cents(moved.cost)).toBe(6000);
    expect(storedPayers(moved)).toEqual({ [group.me.id]: 6000 });
    expect(storedShares(moved)).toEqual({ [group.me.id]: 2000, [group.asha.id]: 2000, [group.ben.id]: 2000 });
    expect(await primaryApi.findAllExpenses(description)).toHaveLength(0);
  });

  // TS-FIX-101: the same split editor serves editing and moving, so both save pre-filled values too.
  test('editing to a pre-filled Exact split saves', async ({ page, primaryApi }) => {
    const { group, description } = await seedUneven(primaryApi, 'ui_edit_prefill');
    const drawer = await openDrawer(page, group.id, description);
    await drawer.getByRole('button', { name: 'Edit expense' }).click();
    const picker = await new GroupsPage(page).openSplitPicker(drawer, 'unequally');
    await picker.getByRole('button', { name: 'Percentage', exact: true }).click();
    await picker.getByRole('button', { name: 'Exact', exact: true }).click();
    await picker.getByRole('button', { name: 'Save', exact: true }).click();
    await drawer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(drawer).toBeHidden({ timeout: 15_000 });

    const after = await storedExpense(primaryApi, group.id, description);
    expect(Object.values(storedShares(after)).sort((a, b) => a - b)).toEqual([3333, 3333, 3334]);
    expect(storedPayers(after)).toEqual(unevenPayers(group));
  });

  test('moving an expense with a pre-filled Percentage split saves', async ({ page, primaryApi }) => {
    const group = await createTripGroup(primaryApi, 'ui_move_prefill');
    const { description } = await primaryApi.createExpense({ cost: 10, description: qaLabel(`move_prefill_${uniqueSuffix()}`) });
    await page.goto('/expenses');
    const decline = page.getByRole('button', { name: 'Decline' });
    if (await decline.isVisible().catch(() => false)) await decline.click();
    await page.getByPlaceholder(/search/i).fill(description);
    await page.locator('button.expense-row-main', { hasText: description }).click();
    await page.getByRole('dialog', { name: 'Expense details' }).getByRole('button', { name: 'Move to group…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move to group' });
    await dialog.getByLabel('Group').click();
    await page.getByRole('option', { name: group.name, exact: true }).click();
    await dialog.getByRole('button', { name: 'Percentage', exact: true }).click();
    await dialog.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.getByText('Expense moved to group')).toBeVisible({ timeout: 15_000 });

    const shares = Object.values(storedShares(await storedExpense(primaryApi, group.id, description)));
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});
