import React from 'react';
import { Alert, Modal } from 'react-native';
import { RequestError } from '../../../core/api/request';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
// One opening records each payment once: a second tap would over-settle the balance (AC-008).
describe('recording a settle-up payment once (TS-FIX-103)', () => {
  const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

  it('ignores another tap while the saved payment is still animating', async () => {
    type('20');
    fireEvent.press(screen.getByText('Record $20.00 paid'));
    await settle();
    fireEvent.press(screen.getByText('Settling…'));
    await settle();
    expect(recordSettlement).toHaveBeenCalledTimes(1);
  });

  it('can be retried after a failed attempt', async () => {
    (recordSettlement as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    type('20');
    fireEvent.press(screen.getByText('Record $20.00 paid'));
    await settle();
    fireEvent.press(screen.getByText('Record $20.00 paid'));
    await settle();
    expect(recordSettlement).toHaveBeenCalledTimes(2);
  });

  // A timeout or 5xx may have been saved, so offering the same payment again could record it twice (AC-008).
  it.each(['single', 'list'])('offers no retry when the outcome is unknown, and asks for a check (%s)', async (mode) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (recordSettlement as jest.Mock).mockRejectedValueOnce(new RequestError('The request timed out.', true));
    const onClose = jest.fn();
    const onSettled = jest.fn();
    const transfers = mode === 'list' ? [{ from_member_id: 'me', to_member_id: 'bob', amount: 20 }] : undefined;
    render(<SettleUpSheet visible groupId="g1" members={members} balances={[]} fromMemberId="bob" toMemberId="me" suggestedAmount={20}
      transfers={transfers} onClose={onClose} onSettled={onSettled} />);
    fireEvent.press(screen.getByText('Record $20.00 paid'));
    await settle();
    const again = screen.queryByText('Record $20.00 paid');
    if (again) fireEvent.press(again);
    await settle();
    expect(recordSettlement).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Check before recording again', expect.any(String));
    alert.mockRestore();
  });

  // The server found this payment saved by an earlier, unconfirmed attempt: a second real payment must not pass as recorded.
  it.each(['single', 'list'])('says nothing new was added when the payment was already recorded (%s)', async (mode) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (recordSettlement as jest.Mock).mockResolvedValueOnce({ alreadyRecorded: true });
    const onClose = jest.fn();
    const onSettled = jest.fn();
    const transfers = mode === 'list' ? [{ from_member_id: 'me', to_member_id: 'bob', amount: 20 }] : undefined;
    render(<SettleUpSheet visible groupId="g1" members={members} balances={[]} fromMemberId="bob" toMemberId="me" suggestedAmount={20}
      transfers={transfers} onClose={onClose} onSettled={onSettled} />);
    fireEvent.press(screen.getByText('Record $20.00 paid'));
    await settle();
    expect(alert).toHaveBeenCalledWith('Already recorded', expect.stringContaining('record it once more'));
    expect(onSettled).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    alert.mockRestore();
  });

  it.each(['single', 'list'])('cannot be dismissed while the payment is being sent (%s)', async (mode) => {
    let finish = () => {};
    (recordSettlement as jest.Mock).mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }));
    const onClose = jest.fn();
    const transfers = mode === 'list' ? [{ from_member_id: 'me', to_member_id: 'bob', amount: 20 }] : undefined;
    render(<SettleUpSheet visible groupId="g1" members={members} balances={[]} fromMemberId="bob" toMemberId="me" suggestedAmount={20}
      transfers={transfers} onClose={onClose} onSettled={jest.fn()} />);
    fireEvent.press(screen.getByText('Record $20.00 paid'));
    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    const close = screen.queryByLabelText('Close');
    if (close) fireEvent.press(close);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finish(); });
  });

  it('records a list once, even if tapped again before the sheet has closed', async () => {
    const transfers = [{ from_member_id: 'me', to_member_id: 'bob', amount: 4 }, { from_member_id: 'me', to_member_id: 'bob', amount: 6 }];
    render(<SettleUpSheet visible groupId="g1" members={members} balances={[]} transfers={transfers} onClose={jest.fn()} onSettled={jest.fn()} />);
    fireEvent.press(screen.getByText('Record $10.00 paid'));
    await settle();
    fireEvent.press(screen.getByText('Record $10.00 paid'));
    await settle();
    expect(recordSettlement).toHaveBeenCalledTimes(2);
  });
});

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
