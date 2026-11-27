import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EditGroupExpenseModal from './EditGroupExpenseModal';
import { updateGroupExpense } from '../api/groups';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('../../tags/hooks/useTagsEnabled', () => ({ useTagsEnabled: () => ({ enabled: false }) }));
jest.mock('../../cards/hooks/useCardCoachEnabled', () => ({ useCardCoachEnabled: () => ({ enabled: false }) }));
jest.mock('../../cards/components/CardPickerField', () => () => null);
jest.mock('../../tags/components/TagPickerModal', () => () => null);
jest.mock('../../../core/ui/Toast', () => ({ showToast: jest.fn() }));
// A button that stands in for the user changing the split.
jest.mock('./SplitEditor', () => {
  const { Text } = jest.requireActual('react-native');
  return (p: any) => (
    <Text onPress={() => p.onChange({ type: 'equal', entries: [{ member_id: 'me' }, { member_id: 'bob' }] })}>pick equal</Text>
  );
});
jest.mock('../api/groups', () => ({ ...jest.requireActual('../api/groups'), updateGroupExpense: jest.fn(async () => ({})) }));

const members: any = [
  { member_id: 'me', display_name: 'Ada', role: 'admin', status: 'active' },
  { member_id: 'bob', display_name: 'Bob', role: 'member', status: 'active' },
];
const expense: any = {
  row_id: 'e1', description: 'Dinner', cost: 30, category: 'Dining out', date: '11/20/2026', split_type: 'equal',
  payer_summary: [{ member_id: 'me', amount_paid: 30 }],
  splits: [{ member_id: 'me', share: 15 }, { member_id: 'bob', share: 15 }],
};

const mount = () =>
  render(<EditGroupExpenseModal visible groupId="g1" expense={expense} members={members} onClose={jest.fn()} onUpdated={jest.fn()} />);
const sentBody = async () => {
  fireEvent.press(screen.getByText('Save Changes'));
  await waitFor(() => expect(updateGroupExpense).toHaveBeenCalled());
  return (updateGroupExpense as jest.Mock).mock.calls[0][2];
};

beforeEach(() => (updateGroupExpense as jest.Mock).mockClear());

describe('editing a manual group expense (TS-FIX-103)', () => {
  // parseFloat reads "1,234.50" as 1 and "12,50" as 12, and the server would shrink every share to match.
  it.each(['1,234.50', '12,50', '12.345', '1e3'])('does not save an amount it would misread: %s', async (typed) => {
    mount();
    fireEvent.changeText(screen.getByTestId('groupEdit.amount'), typed);
    fireEvent.press(screen.getByText('Save Changes'));
    await new Promise((r) => setTimeout(r, 0));
    expect(updateGroupExpense).not.toHaveBeenCalled();
  });

  it('leaves payers and split to the server when only the amount changes', async () => {
    mount();
    fireEvent.changeText(screen.getByTestId('groupEdit.amount'), '41');
    const body = await sentBody();
    expect(body.amount).toBe(41);
    expect(body).not.toHaveProperty('payers');
    expect(body).not.toHaveProperty('split');
  });

  it('moves a single payer’s amount with the total when the split is changed too', async () => {
    mount();
    fireEvent.changeText(screen.getByTestId('groupEdit.amount'), '41');
    fireEvent.press(screen.getByText('pick equal'));
    const body = await sentBody();
    expect(body.payers).toEqual([{ member_id: 'me', amount_paid: 41 }]);
    expect(body.split.type).toBe('equal');
  });
});
