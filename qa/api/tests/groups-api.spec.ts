import { test, expect } from '../fixtures';
import { qaLabel, uniqueSuffix, todayMDY } from '../helpers';
import { QA_USERS } from '../fixtures';

test.describe('groups API @api @critical', () => {
  test('create group, add a member by email, and see them in the roster', async ({ primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`group_${uniqueSuffix()}`) });
    expect(group.group_id).toBeTruthy();

    const member = await primaryApi.addMemberByEmail(group.group_id, QA_USERS.secondary.email);
    expect(member.status).toBe('active'); // a registered email seats immediately

    const roster = await primaryApi.listGroupMembers(group.group_id);
    expect(roster.some((m: any) => m.user_email === QA_USERS.secondary.email)).toBeTruthy();
  });

  test('an equal-split group expense divides a clean amount exactly', async ({ primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`group_${uniqueSuffix()}`) });
    await primaryApi.addMemberByEmail(group.group_id, QA_USERS.secondary.email);
    const [me, other] = await primaryApi.listGroupMembers(group.group_id);

    const created = await primaryApi.createGroupExpense(group.group_id, {
      amount: 10.0,
      payers: [{ member_id: me.member_id, amount_paid: 10.0 }],
      split: { type: 'equal', entries: [{ member_id: me.member_id }, { member_id: other.member_id }] },
      description: qaLabel(`group_expense_clean_${uniqueSuffix()}`),
    });

    const splits: { member_id: string; share: number }[] = created.expense.splits;
    expect(splits).toHaveLength(2);
    for (const s of splits) expect(s.share).toBeCloseTo(5.0, 2);
    const total = splits.reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeCloseTo(10.0, 2);
  });

  /**
   * split_engine.py's largest-remainder apportionment: round each member's share down to
   * whole cents, then hand the leftover cent(s) to the entries with the largest fractional
   * remainder. $10.01 split two ways is the smallest case that actually exercises it
   * ($5.005 each doesn't divide into cents evenly) — asserts the *invariant* (splits sum to
   * the exact total, in whole cents, without assuming which specific member gets the extra
   * cent, since that's a tie-broken-by-member-UUID implementation detail).
   */
  test('an equal-split group expense with an odd cent apportions the remainder correctly', async ({ primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`group_${uniqueSuffix()}`) });
    await primaryApi.addMemberByEmail(group.group_id, QA_USERS.secondary.email);
    const [me, other] = await primaryApi.listGroupMembers(group.group_id);

    const created = await primaryApi.createGroupExpense(group.group_id, {
      amount: 10.01,
      payers: [{ member_id: me.member_id, amount_paid: 10.01 }],
      split: { type: 'equal', entries: [{ member_id: me.member_id }, { member_id: other.member_id }] },
      description: qaLabel(`group_expense_remainder_${uniqueSuffix()}`),
    });

    const shares: number[] = created.expense.splits.map((s: any) => Math.round(s.share * 100));
    const total = shares.reduce((a, b) => a + b, 0);
    expect(total, 'splits must sum to exactly $10.01 in cents, no rounding drift').toBe(1001);
    expect(shares.sort()).toEqual([500, 501]); // one member gets the extra cent, not both/neither
  });

  test('group balances net to zero across all members', async ({ primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`group_${uniqueSuffix()}`) });
    await primaryApi.addMemberByEmail(group.group_id, QA_USERS.secondary.email);
    const [me, other] = await primaryApi.listGroupMembers(group.group_id);

    await primaryApi.createGroupExpense(group.group_id, {
      amount: 20.0,
      payers: [{ member_id: me.member_id, amount_paid: 20.0 }],
      split: { type: 'equal', entries: [{ member_id: me.member_id }, { member_id: other.member_id }] },
      description: qaLabel(`group_expense_balance_${uniqueSuffix()}`),
    });

    const balances = await primaryApi.getGroupBalances(group.group_id);
    const netSum = balances.members.reduce((sum: number, b: any) => sum + b.net, 0);
    expect(netSum).toBeCloseTo(0, 2); // every dollar owed by someone is owed to someone else

    const payer = balances.members.find((b: any) => b.member_id === me.member_id);
    expect(payer.net).toBeCloseTo(10.0, 2); // fronted $20, owes $10 of it — net +$10
  });

  test('an exact split whose entries do not sum to the total is rejected (422/400)', async ({ primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`group_${uniqueSuffix()}`) });
    await primaryApi.addMemberByEmail(group.group_id, QA_USERS.secondary.email);
    const [me, other] = await primaryApi.listGroupMembers(group.group_id);

    const res = await primaryApi.post(`/api/v1/groups/${group.group_id}/expenses`, {
      data: {
        date: todayMDY(),
        description: qaLabel(`bad_exact_split_${uniqueSuffix()}`),
        category: 'Food & Dining',
        amount: 10.0,
        payers: [{ member_id: me.member_id, amount_paid: 10.0 }],
        split: {
          type: 'exact',
          entries: [
            { member_id: me.member_id, value: 3 },
            { member_id: other.member_id, value: 3 }, // sums to 6, not 10
          ],
        },
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('payers not summing to the expense amount is rejected', async ({ primaryApi }) => {
    const group = await primaryApi.createGroup({ name: qaLabel(`group_${uniqueSuffix()}`) });
    const [me] = await primaryApi.listGroupMembers(group.group_id);

    const res = await primaryApi.post(`/api/v1/groups/${group.group_id}/expenses`, {
      data: {
        date: todayMDY(),
        description: qaLabel(`bad_payers_${uniqueSuffix()}`),
        category: 'Food & Dining',
        amount: 10.0,
        payers: [{ member_id: me.member_id, amount_paid: 4.0 }], // short by $6
        split: { type: 'equal', entries: [{ member_id: me.member_id }] },
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('a non-member is rejected from a group\'s routes with 403', async ({ primaryApi, secondaryApi }) => {
    // GroupService.require_membership deliberately raises 403 "Not a member of this
    // group" rather than 404 — unlike require_groups_enabled's 404-for-disabled-feature
    // pattern elsewhere, a group's existence isn't hidden from a logged-in non-member,
    // just access to it. Confirmed by reading services/group_service.py.
    const group = await primaryApi.createGroup({ name: qaLabel(`group_private_${uniqueSuffix()}`) });
    // secondaryApi was never added as a member of this group.
    const res = await secondaryApi.get(`/api/v1/groups/${group.group_id}`);
    expect(res.status()).toBe(403);
  });
});
