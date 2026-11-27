import { expect } from '@playwright/test';
import { AuthedApi } from './api.helper';
import { qaLabel, uniqueSuffix } from './test-data.helper';
import { QA_USERS } from '../fixtures/users.fixture';

/**
 * Setup and server-side reads for the group money journeys (TS-QA-105). Setup goes through the
 * API; the action under test goes through the UI; assertions read what the server stored, in
 * integer cents so a one-cent error can never pass.
 */
export const cents = (amount: unknown): number => Math.round(Number(amount) * 100);

export interface Seat {
  id: string;
  name: string;
}

export interface TripGroup {
  id: string;
  name: string;
  me: Seat;
  asha: Seat;
  ben: Seat;
}

/** The primary persona plus two name-only seats, so no test depends on another account. */
export async function createTripGroup(api: AuthedApi, label: string): Promise<TripGroup> {
  const group = await api.createGroup({ name: qaLabel(`${label}_${uniqueSuffix()}`) });
  for (const display_name of ['Asha', 'Ben']) {
    const res = await api.post(`/api/v1/groups/${group.group_id}/members`, { data: { display_name } });
    if (!res.ok()) throw new Error(`add seat ${display_name} failed: ${res.status()} ${await res.text()}`);
  }
  const members = await api.listGroupMembers(group.group_id);
  const seat = (match: (m: any) => boolean): Seat => {
    const found = members.find(match);
    if (!found) throw new Error(`member missing in ${group.name}`);
    return { id: found.member_id, name: found.display_name };
  };
  return {
    id: group.group_id,
    name: group.name,
    me: seat((m) => m.user_email === QA_USERS.primary.email),
    asha: seat((m) => m.display_name === 'Asha'),
    ben: seat((m) => m.display_name === 'Ben'),
  };
}

type Row = { member_id: string; share?: number; amount_paid?: number };

const byMember = (rows: Row[], field: 'share' | 'amount_paid'): Record<string, number> =>
  Object.fromEntries(rows.map((r) => [r.member_id, cents(r[field])]));

export const storedShares = (expense: any) => byMember(expense.splits, 'share');
export const storedPayers = (expense: any) => byMember(expense.payer_summary, 'amount_paid');

/** Waits for exactly one stored expense with this description and returns it. */
export async function storedExpense(api: AuthedApi, groupId: string, description: string): Promise<any> {
  const matching = async () => (await api.listGroupExpenses(groupId)).filter((e) => e.description === description);
  await expect.poll(async () => (await matching()).length, { timeout: 15_000 }).toBe(1);
  return (await matching())[0];
}

/** member_id -> net balance in cents (positive = is owed). */
export async function netBalances(api: AuthedApi, groupId: string): Promise<Record<string, number>> {
  const body = await api.getGroupBalances(groupId);
  return Object.fromEntries(body.members.map((m: any) => [m.member_id, cents(m.net)]));
}
