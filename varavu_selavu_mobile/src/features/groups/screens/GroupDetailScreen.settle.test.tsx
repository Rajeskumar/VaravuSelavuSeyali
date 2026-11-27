import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GroupDetailScreen from './GroupDetailScreen';
import { getGroupDetail, listGroupExpenses, getGroupBalances } from '../api/groups';
import { showToast } from '../../../core/ui/Toast';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('../../../core/auth/AuthContext', () => ({ useAuth: () => ({ userEmail: 'ada@example.com' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let mockParams: Record<string, string> = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({ params: { groupId: 'g1', ...mockParams } }),
}));
jest.mock('../../../core/ui/Toast', () => ({ showToast: jest.fn() }));
// Stands in for the sheet and shows exactly what would be recorded.
jest.mock('../components/SettleUpSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return (p: any) => (p.visible ? (
    // Pressing the stand-in reports that something may have been recorded.
    <Text onPress={p.onSettled}>{`sheet ${p.fromMemberId}>${p.toMemberId} ${p.suggestedAmount}${p.transfers ? ` list ${p.transfers.length}` : ''}`}</Text>
  ) : null);
});
jest.mock('../components/GroupSettingsSheet', () => () => null);
jest.mock('../components/EditGroupExpenseModal', () => () => null);
jest.mock('../../activity/components/ActivityList', () => () => null);
jest.mock('../../expenses/components/ExpenseDetailSheet', () => () => null);
jest.mock('../../expenses/screens/AddExpenseScreen', () => ({
  AddExpenseContext: jest.requireActual('react').createContext({ openAddExpense: () => {} }),
}));
jest.mock('../api/groups', () => ({
  ...jest.requireActual('../api/groups'),
  getGroupDetail: jest.fn(),
  listGroupExpenses: jest.fn(),
  getGroupBalances: jest.fn(),
}));

const member = (id: string, name: string, email: string | null) =>
  ({ member_id: id, display_name: name, role: 'member', status: 'active', user_email: email });
const balance = (id: string, name: string, net: number) => ({ member_id: id, display_name: name, net });

let client: QueryClient;
function mount(transfers: Array<[string, string, number]>, nets: [number, number, number], cached?: object, status = 'active', refreshFails = false) {
  (getGroupDetail as jest.Mock).mockResolvedValue({
    group_id: 'g1', name: 'Trip', status, currency: 'USD', simplify_debts: true,
    members: [member('me', 'Ada', 'ada@example.com'), member('bob', 'Bob', 'bob@example.com'), member('cy', 'Cy', null)],
  });
  (listGroupExpenses as jest.Mock).mockResolvedValue({ items: [] });
  (getGroupBalances as jest.Mock).mockResolvedValue({
    members: [balance('me', 'Ada', nets[0]), balance('bob', 'Bob', nets[1]), balance('cy', 'Cy', nets[2])],
    transfers: transfers.map(([from_member_id, to_member_id, amount]) => ({ from_member_id, to_member_id, amount })),
  });
  // The refetch arrives after the screen has already rendered from the cache, as over a real network.
  if (cached) {
    const fresh = (getGroupBalances as jest.Mock).getMockImplementation()!;
    (getGroupBalances as jest.Mock).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100));
      if (refreshFails) throw new Error('offline');
      return fresh();
    });
  }
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  // Balances left over from an earlier visit: shown at once, then refetched.
  if (cached) client.setQueryData(['group-balances', 'g1'], cached, { updatedAt: 1 });
  return render(<QueryClientProvider client={client}><GroupDetailScreen /></QueryClientProvider>);
}
const tapRow = async (label: string) => {
  fireEvent.press(await screen.findByText('Balances'));
  fireEvent.press(await screen.findByText(label));
};

beforeEach(() => { mockParams = {}; (showToast as jest.Mock).mockClear(); });
afterEach(() => client.clear());

describe('settle up from a balance row (TS-FIX-103)', () => {
  it('records them paying me when they owe me', async () => {
    mount([['bob', 'me', 15]], [15, -15, 0]);
    await tapRow('Owes $15.00');
    expect(await screen.findByText('sheet bob>me 15')).toBeTruthy();
  });

  it('records me paying them when I owe them', async () => {
    mount([['me', 'bob', 11]], [-11, 11, 0]);
    await tapRow('Gets back $11.00');
    expect(await screen.findByText('sheet me>bob 11')).toBeTruthy();
  });

  it('uses the transfer between us, not the other member’s net', async () => {
    // Bob owes 40 in total, but only 15 of it to me.
    mount([['bob', 'me', 15], ['bob', 'cy', 25]], [15, -40, 25]);
    await tapRow('Owes $40.00');
    expect(await screen.findByText('sheet bob>me 15')).toBeTruthy();
  });

  it('opens nothing when there is no payment between us', async () => {
    mount([['bob', 'cy', 25]], [0, -25, 25]);
    await tapRow('Gets back $25.00');
    expect(screen.queryByText(/^sheet /)).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Nothing to settle between you and Cy' }));
  });

  it('uses the same direction for the People tab shortcut', async () => {
    mockParams = { settleCounterpartyEmail: 'bob@example.com' };
    mount([['bob', 'me', 15]], [15, -15, 0]);
    expect(await screen.findByText('sheet bob>me 15')).toBeTruthy();
  });

  it('lists only the payments I owe from my own row', async () => {
    mount([['me', 'bob', 0.1], ['me', 'cy', 33.33], ['bob', 'cy', 5]], [-33.43, -4.9, 38.33]);
    await tapRow('Owes $33.43');
    expect(await screen.findByText('sheet me>bob 0.1 list 2')).toBeTruthy();
  });

  it('waits for fresh balances before the People tab shortcut pre-fills an amount', async () => {
    mockParams = { settleCounterpartyEmail: 'bob@example.com' };
    mount([['bob', 'me', 15]], [15, -15, 0], {
      members: [balance('me', 'Ada', 99), balance('bob', 'Bob', -99), balance('cy', 'Cy', 0)],
      transfers: [{ from_member_id: 'bob', to_member_id: 'me', amount: 99 }],
    });
    expect(await screen.findByText('sheet bob>me 15')).toBeTruthy();
  });
});

describe('the Settle up button and my own row (TS-FIX-103)', () => {
  const settleButton = async () => fireEvent.press(await screen.findByText('Settle up'));
  const ownRow = () => tapRow('Gets back $15.00');

  it.each([['the button', settleButton], ['my own row', ownRow]])(
    'records the payment to me from %s when only one person owes me', async (_, act) => {
      mount([['bob', 'me', 15]], [15, -15, 0]);
      await screen.findByText('$15.00');
      await act();
      expect(await screen.findByText('sheet bob>me 15')).toBeTruthy();
    });

  it('asks which person paid, on Balances, when several owe me', async () => {
    mount([['bob', 'me', 15], ['cy', 'me', 5]], [20, -15, -5]);
    await screen.findByText('$20.00');
    await settleButton();
    expect(await screen.findByText('Owes $15.00')).toBeTruthy();
    expect(screen.queryByText(/^sheet /)).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Tap the person who paid you' }));
  });

  it('says I am settled up instead of opening an empty form', async () => {
    mount([['bob', 'cy', 25]], [0, -25, 25]);
    await screen.findByText("You're all settled up");
    await settleButton();
    expect(screen.queryByText(/^sheet /)).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'You have nothing to settle in this group' }));
  });
});

// Just after a payment the cached transfers still include it; offering them could record it twice (AC-008).
describe('settle up while balances are not current (TS-FIX-103)', () => {
  const old = {
    members: [balance('me', 'Ada', 99), balance('bob', 'Bob', -99), balance('cy', 'Cy', 0)],
    transfers: [{ from_member_id: 'bob', to_member_id: 'me', amount: 99 }],
  };
  const expectBlocked = () => {
    expect(screen.queryByText(/^sheet /)).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Balances are updating. Try again in a moment.' }));
  };

  it('opens nothing by hand while balances are refreshing', async () => {
    mount([['bob', 'me', 15]], [15, -15, 0], old);
    await tapRow('Owes $99.00');
    expectBlocked();
  });

  // The balances query retries twice before it reports the failure.
  it('opens nothing by hand from old balances after the refresh failed', async () => {
    mount([['bob', 'me', 15]], [15, -15, 0], old, 'active', true);
    await act(async () => { await new Promise((r) => setTimeout(r, 3800)); });
    await tapRow('Owes $99.00');
    expectBlocked();
  }, 15000);
});

describe('after a payment that was, or may have been, recorded (TS-FIX-103)', () => {
  // The "check before recording again" alert points at Activity, which is otherwise cached for five minutes.
  it('refreshes balances and activity', async () => {
    mount([['bob', 'me', 15]], [15, -15, 0]);
    await tapRow('Owes $15.00');
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await act(async () => { fireEvent.press(await screen.findByText('sheet bob>me 15')); });
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(['group-balances', 'g1']), JSON.stringify(['group-activity', 'g1'])]));
  });
});

describe('settle up edge cases (TS-FIX-103)', () => {
  it('lets me tap someone who owes me although their net is zero', async () => {
    // Simplified debts off: Bob owes me 15 and Cy owes Bob 15.
    mount([['bob', 'me', 15], ['cy', 'me', 5], ['cy', 'bob', 15]], [20, 0, -20]);
    await tapRow('Settled up');
    expect(await screen.findByText('sheet bob>me 15')).toBeTruthy();
  });

  it('does not ask for a tap in an archived group, where rows cannot be used', async () => {
    mount([['bob', 'me', 15], ['cy', 'me', 5]], [20, -15, -5], undefined, 'archived');
    await screen.findByText('$20.00');
    fireEvent.press(screen.getByText('Settle up'));
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unarchive this group to record payments' }));
  });

  it('pre-fills nothing from old balances when refreshing them fails', async () => {
    mockParams = { settleCounterpartyEmail: 'bob@example.com' };
    mount([['bob', 'me', 15]], [15, -15, 0], {
      members: [balance('me', 'Ada', 99), balance('bob', 'Bob', -99), balance('cy', 'Cy', 0)],
      transfers: [{ from_member_id: 'bob', to_member_id: 'me', amount: 99 }],
    }, 'active', true);
    await screen.findByText('$99.00');
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.queryByText(/^sheet /)).toBeNull();
  });
});
