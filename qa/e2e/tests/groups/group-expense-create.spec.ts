import { test, expect } from '../../fixtures/auth.fixture';
import { GroupsPage } from '../../pages/GroupsPage';
import { QuickCapturePanel } from '../../pages/QuickCapturePanel';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { createTripGroup, storedExpense, storedShares, storedPayers, netBalances, cents } from '../../helpers/group-money.helper';
import { QA_USERS } from '../../fixtures/users.fixture';
import type { Locator, Page } from '@playwright/test';

// TS-QA-105 / backlog A1: adding members and group expenses through the web UI. Before this, specs
// created group expenses through the API, so a broken form could ship unnoticed.
test.describe('group members and new group expenses (UI) @regression @critical', () => {
  test.describe('adding members', () => {
    async function openAddMember(page: Page, groupId: string): Promise<Locator> {
      const groups = new GroupsPage(page);
      await groups.openDetail(groupId);
      await groups.addMemberButton.filter({ visible: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Add member' });
      await expect(dialog).toBeVisible();
      return dialog;
    }

    test('a registered person added by email gets their own account seat', async ({ page, primaryApi }) => {
      const group = await primaryApi.createGroup({ name: qaLabel(`ui_member_${uniqueSuffix()}`) });
      const dialog = await openAddMember(page, group.group_id);
      await dialog.getByLabel('Email').fill(QA_USERS.secondary.email);
      await dialog.getByRole('button', { name: 'Add or invite' }).click();
      await expect(page.getByText('Member added')).toBeVisible({ timeout: 15_000 });

      const members = await primaryApi.listGroupMembers(group.group_id);
      expect(members).toHaveLength(2);
      expect(members.map((m: any) => m.user_email)).toContain(QA_USERS.secondary.email);
    });

    test('an unregistered email gets a pending seat and an invite', async ({ page, primaryApi }) => {
      const group = await primaryApi.createGroup({ name: qaLabel(`ui_invite_${uniqueSuffix()}`) });
      // Mail is disabled on the QA stack, so nothing is sent to this synthetic address.
      const email = `qa.unregistered.${Date.now()}@example.com`;
      const dialog = await openAddMember(page, group.group_id);
      await dialog.getByLabel('Email').fill(email);
      await dialog.getByLabel('Name (optional)').fill('Priya');
      await dialog.getByRole('button', { name: 'Add or invite' }).click();
      await expect(page.getByText(`Invite emailed to ${email}`)).toBeVisible({ timeout: 15_000 });

      const members = await primaryApi.listGroupMembers(group.group_id);
      expect(members).toHaveLength(2);
      expect(members.find((m: any) => m.display_name === 'Priya')).toMatchObject({ invite_pending: true });
    });

    test('a name-only member can be added', async ({ page, primaryApi }) => {
      const group = await primaryApi.createGroup({ name: qaLabel(`ui_seat_${uniqueSuffix()}`) });
      const dialog = await openAddMember(page, group.group_id);
      await dialog.getByRole('button', { name: 'Name only' }).click();
      await dialog.getByLabel('Name').fill('Ravi');
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByText('Member added')).toBeVisible({ timeout: 15_000 });

      const members = await primaryApi.listGroupMembers(group.group_id);
      expect(members.find((m: any) => m.display_name === 'Ravi')).toMatchObject({ invite_pending: false });
    });
  });

  async function startExpense(page: Page, groupId: string, amount: string, description: string): Promise<Locator> {
    const groups = new GroupsPage(page);
    await groups.openDetail(groupId);
    const dialog = await groups.openAddExpense();
    const capture = new QuickCapturePanel(page);
    await capture.enterAmount(amount);
    await capture.fillDescription(description);
    return dialog;
  }

  async function saveAndConfirm(page: Page): Promise<void> {
    const capture = new QuickCapturePanel(page);
    await expect(capture.saveButton).toHaveText('Save & split');
    await capture.save();
    await capture.expectSavedConfirmation();
    await capture.closeSavedPanel();
  }

  test.describe('split methods', () => {
    test('equal: an odd cent is shared out and the shares add up to the total', async ({ page, primaryApi }) => {
      const group = await createTripGroup(primaryApi, 'ui_equal');
      const description = qaLabel(`equal_${uniqueSuffix()}`);
      await startExpense(page, group.id, '100.25', description);
      await saveAndConfirm(page);

      const expense = await storedExpense(primaryApi, group.id, description);
      expect(cents(expense.cost)).toBe(10025);
      expect(storedPayers(expense)).toEqual({ [group.me.id]: 10025 });
      const shares = Object.values(storedShares(expense)).sort();
      expect(shares).toEqual([3341, 3342, 3342]);
      const net = await netBalances(primaryApi, group.id);
      expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
      expect(net[group.me.id]).toBe(10025 - storedShares(expense)[group.me.id]);
    });

    // Totals and values are chosen so no two methods would store the same shares from the same input
    // (on a total of 100, a percentage and an exact amount look identical).
    const cases: { tab: string; total: string; typed: string[]; expected: [number, number, number] }[] = [
      { tab: 'Exact', total: '100.50', typed: ['60.25', '25.15', '15.10'], expected: [6025, 2515, 1510] },
      { tab: 'Percentage', total: '80.40', typed: ['50', '30', '20'], expected: [4020, 2412, 1608] },
      { tab: 'Shares', total: '80.40', typed: ['2', '1', '1'], expected: [4020, 2010, 2010] },
      // +10.30 to the viewer, the other 90.00 split three ways.
      { tab: 'Adjustment', total: '100.30', typed: ['10.30', '0', '0'], expected: [4030, 3000, 3000] },
    ];

    for (const { tab, total, typed, expected } of cases) {
      test(`${tab}: the values typed produce the stored shares`, async ({ page, primaryApi }) => {
        const group = await createTripGroup(primaryApi, `ui_${tab.toLowerCase()}`);
        const description = qaLabel(`${tab.toLowerCase()}_${uniqueSuffix()}`);
        const dialog = await startExpense(page, group.id, total, description);
        const picker = await new GroupsPage(page).openSplitPicker(dialog);
        await picker.getByRole('button', { name: tab, exact: true }).click();
        const members = [group.me, group.asha, group.ben];
        for (const [i, member] of members.entries()) {
          await picker.getByLabel(`${tab.toLowerCase()} for ${member.name}`, { exact: true }).fill(typed[i]);
        }
        await picker.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(picker).toBeHidden();
        await saveAndConfirm(page);

        const expense = await storedExpense(primaryApi, group.id, description);
        expect(expense.split_type).toBe(tab.toLowerCase());
        expect(storedShares(expense)).toEqual({
          [group.me.id]: expected[0],
          [group.asha.id]: expected[1],
          [group.ben.id]: expected[2],
        });
        expect(storedPayers(expense)).toEqual({ [group.me.id]: cents(total) });
      });
    }

    // TS-FIX-101: saving the pre-filled values as they are. They used to be 33.33 x 3, which the
    // form accepted and the server refused. Who gets the extra cent is random, so compare sorted.
    for (const { tab, total, expected } of [
      { tab: 'Exact', total: '10', expected: [333, 333, 334] },
      { tab: 'Exact', total: '20', expected: [666, 667, 667] },
      { tab: 'Percentage', total: '100', expected: [3333, 3333, 3334] },
    ]) {
      test(`${tab} on ${total}: the pre-filled values save and add up to the total`, async ({ page, primaryApi }) => {
        const group = await createTripGroup(primaryApi, 'ui_prefill');
        const description = qaLabel(`prefill_${uniqueSuffix()}`);
        const dialog = await startExpense(page, group.id, total, description);
        const picker = await new GroupsPage(page).openSplitPicker(dialog);
        await picker.getByRole('button', { name: tab, exact: true }).click();
        await picker.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(picker).toBeHidden();
        await saveAndConfirm(page);

        const expense = await storedExpense(primaryApi, group.id, description);
        expect(expense.split_type).toBe(tab.toLowerCase());
        const shares = Object.values(storedShares(expense)).sort((a, b) => a - b);
        expect(shares).toEqual(expected);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(cents(total));
      });
    }

    // What each person is shown must be what is stored for them. $10 makes the pre-filled 33.34% matter:
    // the server gives the spare cent by the exact fractions, whoever got the extra 0.01%.
    test('Percentage: each person\'s previewed share is the share stored for them', async ({ page, primaryApi }) => {
      const group = await createTripGroup(primaryApi, 'ui_preview');
      const description = qaLabel(`preview_${uniqueSuffix()}`);
      const dialog = await startExpense(page, group.id, '10', description);
      const picker = await new GroupsPage(page).openSplitPicker(dialog);
      await picker.getByRole('button', { name: 'Percentage', exact: true }).click();

      const shown: Record<string, number> = {};
      for (const member of [group.me, group.asha, group.ben]) {
        // The innermost block holding this person's checkbox and a dollar amount is their row.
        const row = picker
          .locator('div')
          .filter({ has: page.getByRole('checkbox', { name: `Include ${member.name}`, exact: true }) })
          .filter({ hasText: '$' })
          .last();
        shown[member.id] = cents((await row.innerText()).match(/\$(\d+\.\d{2})/)![1]);
      }
      await picker.getByRole('button', { name: 'Save', exact: true }).click();
      await saveAndConfirm(page);

      expect(storedShares(await storedExpense(primaryApi, group.id, description))).toEqual(shown);
    });

    test('leaving a person out of an equal split gives them no share', async ({ page, primaryApi }) => {
      const group = await createTripGroup(primaryApi, 'ui_exclude');
      const description = qaLabel(`exclude_${uniqueSuffix()}`);
      const dialog = await startExpense(page, group.id, '30', description);
      const picker = await new GroupsPage(page).openSplitPicker(dialog);
      await picker.getByRole('checkbox', { name: `Include ${group.ben.name}` }).uncheck();
      await picker.getByRole('button', { name: 'Save', exact: true }).click();
      await saveAndConfirm(page);

      const expense = await storedExpense(primaryApi, group.id, description);
      expect(storedShares(expense)).toEqual({ [group.me.id]: 1500, [group.asha.id]: 1500 });
    });

    test('an exact split that does not add up cannot be saved', async ({ page, primaryApi }) => {
      const group = await createTripGroup(primaryApi, 'ui_badsplit');
      const dialog = await startExpense(page, group.id, '100', qaLabel(`bad_split_${uniqueSuffix()}`));
      const picker = await new GroupsPage(page).openSplitPicker(dialog);
      await picker.getByRole('button', { name: 'Exact', exact: true }).click();
      await picker.getByLabel(`exact for ${group.me.name}`, { exact: true }).fill('1');
      await expect(picker.getByText(/Exact amounts must total \$100\.00/)).toBeVisible();
      await expect(picker.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    });

    test('changing the total after an exact split blocks Save instead of rewriting the split', async ({ page, primaryApi }) => {
      const group = await createTripGroup(primaryApi, 'ui_stale');
      const dialog = await startExpense(page, group.id, '90', qaLabel(`stale_${uniqueSuffix()}`));
      const picker = await new GroupsPage(page).openSplitPicker(dialog);
      await picker.getByRole('button', { name: 'Exact', exact: true }).click();
      await picker.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(picker).toBeHidden();

      const capture = new QuickCapturePanel(page);
      await expect(capture.saveButton).toBeEnabled();
      await capture.replaceAmount('90', '120');
      await expect(capture.saveButton).toBeDisabled();
      // Back at the original total it is valid again: the 30/30/30 split was kept, and nothing else blocks Save.
      await capture.replaceAmount('120', '90');
      await expect(capture.saveButton).toBeEnabled();
    });
  });

  test.describe('payers and capture from elsewhere', () => {
    test('two payers are stored with what each one paid', async ({ page, primaryApi }) => {
      const group = await createTripGroup(primaryApi, 'ui_payers');
      const description = qaLabel(`payers_${uniqueSuffix()}`);
      const dialog = await startExpense(page, group.id, '90.75', description);
      const picker = await new GroupsPage(page).openPayerPicker(dialog);
      await picker.getByText('Multiple people').click();
      await picker.getByLabel(`Amount paid by ${group.me.name}`, { exact: true }).fill('70.50');
      await picker.getByRole('checkbox', { name: `Include ${group.asha.name} as payer` }).check();
      await expect(picker.getByText(/Payments reconcile/)).toBeVisible();
      await picker.getByRole('button', { name: 'Save', exact: true }).click();
      await saveAndConfirm(page);

      const expense = await storedExpense(primaryApi, group.id, description);
      expect(storedPayers(expense)).toEqual({ [group.me.id]: 7050, [group.asha.id]: 2025 });
      expect(await netBalances(primaryApi, group.id)).toEqual({
        [group.me.id]: 4025,
        [group.asha.id]: -1000,
        [group.ben.id]: -3025,
      });
    });

    test('someone else can be recorded as the payer', async ({ page, primaryApi }) => {
      const group = await createTripGroup(primaryApi, 'ui_otherpayer');
      const description = qaLabel(`other_payer_${uniqueSuffix()}`);
      const dialog = await startExpense(page, group.id, '30', description);
      const picker = await new GroupsPage(page).openPayerPicker(dialog);
      await picker.getByText(group.ben.name, { exact: true }).click();
      await expect(picker).toBeHidden();
      await saveAndConfirm(page);

      const expense = await storedExpense(primaryApi, group.id, description);
      expect(storedPayers(expense)).toEqual({ [group.ben.id]: 3000 });
      expect((await netBalances(primaryApi, group.id))[group.me.id]).toBe(-1000);
    });

    test('New expense on the dashboard with a group chosen creates one group expense', async ({ page, primaryApi }) => {
      const group = await createTripGroup(primaryApi, 'ui_capture');
      const description = qaLabel(`dash_capture_${uniqueSuffix()}`);
      await page.goto('/dashboard');
      const capture = new QuickCapturePanel(page);
      await capture.openViaAddExpenseButton();
      await capture.enterAmount('45.75');
      await capture.fillDescription(description);
      await capture.whoChip(group.id).click();
      await expect(page.getByRole('dialog', { name: 'New expense' }).getByText(/Paid by/)).toBeVisible({ timeout: 15_000 });
      await saveAndConfirm(page);

      const expense = await storedExpense(primaryApi, group.id, description);
      expect(storedShares(expense)).toEqual({ [group.me.id]: 1525, [group.asha.id]: 1525, [group.ben.id]: 1525 });
      // It must not also exist as a personal expense (that list holds only non-group records).
      expect(await primaryApi.findAllExpenses(description)).toHaveLength(0);
    });
  });
});
