import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ExpenseDetailSheet from './ExpenseDetailSheet';
import { ApiError, settleExpenseShare } from '../../groups/api/groups';
import { showToast } from '../../../core/ui/Toast';

// TS-FIX-104: a refused second payment left the old balance on screen, inviting the person to pay it again.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../core/ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../../tags/hooks/useTagsEnabled', () => ({ useTagsEnabled: () => ({ enabled: false }) }));
jest.mock('../../groups/api/groups', () => ({
  ...jest.requireActual('../../groups/api/groups'),
  listExpenseComments: jest.fn().mockResolvedValue([]),
  getExpenseHistory: jest.fn().mockResolvedValue([]),
  settleExpenseShare: jest.fn(),
}));

const members: any = [
  { member_id: 'me', display_name: 'Ada', role: 'admin', status: 'active' },
  { member_id: 'bob', display_name: 'Bob', role: 'member', status: 'active' },
];
const expense: any = {
  row_id: 'e1', description: 'Dinner', cost: 30, my_share: 15, category: 'Dining out', date: '11/20/2026', split_type: 'equal',
  payer_summary: [{ member_id: 'bob', amount_paid: 30 }],
  splits: [{ member_id: 'me', share: 15 }, { member_id: 'bob', share: 15 }],
};

async function settleAndFail(error: Error) {
  (settleExpenseShare as jest.Mock).mockRejectedValue(error);
  (showToast as jest.Mock).mockClear();
  const onSettled = jest.fn();
  render(<ExpenseDetailSheet visible onClose={jest.fn()} groupId="g1" expense={expense} members={members}
    myMemberId="me" onSettled={onSettled} onDeleted={jest.fn()} onEdit={jest.fn()} />);
  fireEvent.press(await screen.findByText(/Settle my .*15\.00 share/));
  await waitFor(() => expect(showToast).toHaveBeenCalled());
  return onSettled;
}

describe('settle my share (TS-FIX-104)', () => {
  it('says a share was already settled and refreshes the balances', async () => {
    const onSettled = await settleAndFail(new ApiError('This share has already been settled', 409, null));
    expect(showToast).toHaveBeenCalledWith({ message: 'This share has already been settled', type: 'error' });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('keeps the expense open after any other refusal', async () => {
    const onSettled = await settleAndFail(new ApiError('Expense has no payers', 400, null));
    expect(onSettled).not.toHaveBeenCalled();
  });
});
