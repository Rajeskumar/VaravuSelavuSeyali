import { test, expect } from '../../fixtures/auth.fixture';
import { GroupsPage } from '../../pages/GroupsPage';
import { QuickCapturePanel } from '../../pages/QuickCapturePanel';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { createTripGroup, storedExpense, storedShares } from '../../helpers/group-money.helper';

// TS-FIX-101 AC-004: no minus values. A large negative adjustment used to store shares that no longer
// added up to the expense (10.00 with +20, -10, -10 left one person owing 23.33).
test.describe('no minus values in group money (UI and API) @regression @critical', () => {
  test('the server refuses a negative adjustment and stores nothing', async ({ primaryApi }) => {
    const group = await createTripGroup(primaryApi, 'api_negative');
    const res = await primaryApi.post(`/api/v1/groups/${group.id}/expenses`, {
      data: {
        date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
        description: qaLabel(`negative_${uniqueSuffix()}`),
        category: 'Food & Dining',
        amount: 10,
        payers: [{ member_id: group.me.id, amount_paid: 10 }],
        split: {
          type: 'adjustment',
          entries: [
            { member_id: group.me.id, value: 20 },
            { member_id: group.asha.id, value: -10 },
            { member_id: group.ben.id, value: -10 },
          ],
        },
      },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain('cannot be negative');
    expect(await primaryApi.listGroupExpenses(group.id)).toHaveLength(0);
  });

  test('typing a minus is ignored, and too large an adjustment cannot be saved', async ({ page, primaryApi }) => {
    const group = await createTripGroup(primaryApi, 'ui_negative');
    const description = qaLabel(`ui_negative_${uniqueSuffix()}`);
    const groups = new GroupsPage(page);
    await groups.openDetail(group.id);
    const dialog = await groups.openAddExpense();
    const capture = new QuickCapturePanel(page);
    await capture.enterAmount('30');
    await capture.fillDescription(description);

    const picker = await groups.openSplitPicker(dialog);
    await picker.getByRole('button', { name: 'Adjustment', exact: true }).click();
    const mine = picker.getByLabel(`adjustment for ${group.me.name}`, { exact: true });
    await mine.fill('');
    await mine.pressSequentially('-6'); // real key presses: the minus never arrives
    await expect(mine).toHaveValue('6');

    await mine.fill('31');
    await expect(picker.getByText(/Adjustments can't add up to more than \$30\.00/)).toBeVisible();
    await expect(picker.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    // "Ben pays 6 less" is entered as +6 for everyone else.
    await mine.fill('6');
    await picker.getByLabel(`adjustment for ${group.asha.name}`, { exact: true }).fill('6');
    await picker.getByRole('button', { name: 'Save', exact: true }).click();
    await capture.save();
    await capture.expectSavedConfirmation();

    const expense = await storedExpense(primaryApi, group.id, description);
    expect(storedShares(expense)).toEqual({ [group.me.id]: 1200, [group.asha.id]: 1200, [group.ben.id]: 600 });
  });

  test('a minus cannot be typed into the settlement amount', async ({ page, primaryApi }) => {
    const group = await createTripGroup(primaryApi, 'ui_negative_settle');
    const groups = new GroupsPage(page);
    await primaryApi.createGroupExpense(group.id, {
      description: qaLabel(`settle_seed_${uniqueSuffix()}`),
      amount: 30,
      payers: [{ member_id: group.me.id, amount_paid: 30 }],
      split: { type: 'equal', entries: [group.me, group.asha, group.ben].map((m) => ({ member_id: m.id })) },
    });
    await groups.openDetail(group.id);
    await page.getByRole('button', { name: 'Settle up', exact: true }).filter({ visible: true }).first().click();
    const settle = page.getByRole('dialog', { name: 'Settle up' });
    await settle.getByRole('button', { name: 'Record a custom settlement' }).click();
    const amount = settle.getByLabel('Amount');
    await amount.fill('');
    await amount.pressSequentially('-5');
    // The field keeps its leading 0 while being typed ("05"); what matters is 5, with no minus.
    await expect(amount).toHaveValue(/^0?5$/);
  });
});
