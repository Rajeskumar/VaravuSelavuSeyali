import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SettleUpSheet from './SettleUpSheet';
import { recordSettlement } from '../api/groups';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('../../../core/auth/AuthContext', () => ({ useAuth: () => ({ userEmail: 'ada@example.com' }) }));
jest.mock('../../../core/ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../api/groups', () => ({ ...jest.requireActual('../api/groups'), recordSettlement: jest.fn(async () => ({})) }));

const members: any = [
  { member_id: 'me', display_name: 'Ada', user_email: 'ada@example.com', status: 'active' },
  { member_id: 'bob', display_name: 'Bob', status: 'active' },
];
const type = (text: string) => {
  render(
    <SettleUpSheet visible groupId="g1" members={members} balances={[]} fromMemberId="bob" toMemberId="me" suggestedAmount={20}
      onClose={jest.fn()} onSettled={jest.fn()} />,
  );
  fireEvent.changeText(screen.getByTestId('settle.amount'), text);
};

beforeEach(() => (recordSettlement as jest.Mock).mockClear());

describe('the typed settle-up amount (TS-FIX-103)', () => {
  it('records a comma decimal as typed, and the button says the same', async () => {
    type('12,50');
    fireEvent.press(screen.getByText('Record $12.50 paid'));
    await waitFor(() => expect(recordSettlement).toHaveBeenCalled());
    expect((recordSettlement as jest.Mock).mock.calls[0][1]).toMatchObject({ from_member_id: 'bob', to_member_id: 'me', amount: 12.5 });
  });

  it.each(['1,234.50', '12.345', '1,234'])('records nothing for an amount it would misread: %s', async (typed) => {
    type(typed);
    fireEvent.press(screen.getByText('Record payment'));
    await new Promise((r) => setTimeout(r, 0));
    expect(recordSettlement).not.toHaveBeenCalled();
  });
});
