import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import EditGroupExpenseModal from './EditGroupExpenseModal';

// The real split and payer editors: what the user reads after changing only the amount.
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

const members: any = [
  { member_id: 'me', display_name: 'Ada', role: 'admin', status: 'active' },
  { member_id: 'bob', display_name: 'Bob', role: 'member', status: 'active' },
];
const expense: any = {
  row_id: 'e1', description: 'Dinner', cost: 30, category: 'Dining out', date: '11/20/2026', split_type: 'equal',
  payer_summary: [{ member_id: 'me', amount_paid: 20 }, { member_id: 'bob', amount_paid: 10 }],
  splits: [{ member_id: 'me', share: 15 }, { member_id: 'bob', share: 15 }],
};
const NOTE = 'The saved split and payments will adjust to the new total unless you change them below.';

describe('what the editors say after an amount-only change (TS-FIX-103)', () => {
  it('explains the adjustment instead of reporting errors that do not block saving', () => {
    render(<EditGroupExpenseModal visible groupId="g1" expense={expense} members={members} onClose={jest.fn()} onUpdated={jest.fn()} />);
    expect(screen.queryByText(NOTE)).toBeNull();
    fireEvent.changeText(screen.getByTestId('groupEdit.amount'), '45');
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.queryByText(/must total/)).toBeNull();
    expect(screen.queryByText(/must equal total/)).toBeNull();
    expect(screen.queryByText(/ left$/)).toBeNull();
  });

  it('checks them again once the user changes the split', () => {
    render(<EditGroupExpenseModal visible groupId="g1" expense={expense} members={members} onClose={jest.fn()} onUpdated={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('groupEdit.amount'), '45');
    fireEvent.press(screen.getByLabelText('Include Bob'));
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.getByText(/Exact amounts must total \$45\.00/)).toBeTruthy();
    expect(screen.getByText(/must equal total/)).toBeTruthy();
  });
});
