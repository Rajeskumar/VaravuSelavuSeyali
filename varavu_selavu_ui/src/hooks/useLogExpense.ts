import { useQueryClient } from '@tanstack/react-query';
import { addExpense, AddExpensePayload } from '../api/expenses';
import { createGroupExpense, getGroup, GroupExpensePayload } from '../api/groups';
import { notifyExpenseChanged } from '../utils/expenseEvents';
import { isoToMMDDYYYY } from '../utils/date';

export interface QuickLogInput {
  description: string;
  category: string;
  /** Total amount — for a group log, this is the whole expense, split equally. */
  amount: number;
  merchantName?: string;
  /** ISO yyyy-mm-dd; defaults to today. */
  date?: string;
}

export interface QuickLogGroupResult {
  memberCount: number;
  myShare: number;
}

/**
 * Shared "save a quick-logged expense" path for QuickCaptureSheet and the Home
 * type-to-log bar — wraps addExpense/createGroupExpense with the same cache
 * invalidation MainLayout's FAB dialog already does (TS-DES-111's
 * `notifyExpenseChanged`, since not every page fetches via react-query) so
 * Home's recent feed/total refresh immediately regardless of entry point.
 */
export function useLogExpense() {
  const queryClient = useQueryClient();
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') || '' : '';

  const afterSave = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses', user] });
    notifyExpenseChanged();
  };

  const logPersonal = async (input: QuickLogInput) => {
    const payload: AddExpensePayload = {
      user_id: user,
      date: isoToMMDDYYYY(input.date || new Date().toISOString().split('T')[0]),
      description: input.description,
      category: input.category,
      cost: input.amount,
      merchant_name: input.merchantName || undefined,
    };
    const result = await addExpense(payload);
    afterSave();
    return result;
  };

  const logToGroup = async (groupId: string, input: QuickLogInput): Promise<QuickLogGroupResult> => {
    const group = await getGroup(groupId);
    const myMember = group.members.find((m) => m.user_email === user);
    if (!myMember) throw new Error('You are not a member of this group.');

    const payload: GroupExpensePayload = {
      date: isoToMMDDYYYY(input.date || new Date().toISOString().split('T')[0]),
      description: input.description,
      category: input.category,
      amount: input.amount,
      merchant_name: input.merchantName || undefined,
      payers: [{ member_id: myMember.member_id, amount_paid: input.amount }],
      split: { type: 'equal', entries: group.members.map((m) => ({ member_id: m.member_id })) },
    };
    await createGroupExpense(groupId, payload);
    afterSave();
    // GroupsPage's own Add Expense flow invalidates these same two keys after
    // createGroupExpense — this entry point bypasses that page's handler, so it
    // has to invalidate them itself or a currently-open group detail view (and
    // the rail's balance figures) would show stale data until a manual refresh.
    queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
    queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['friend-balances'] });
    return { memberCount: group.members.length, myShare: input.amount / group.members.length };
  };

  return { logPersonal, logToGroup };
}
