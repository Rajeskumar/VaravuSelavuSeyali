/** The inline recurring edit used parseFloat (AC-012), and Move to group must not send an unclear split (AC-009). */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExpensesScreen from './ExpensesScreen';
import { listRecurringTemplates, upsertRecurringTemplate } from '../../recurring/api/recurring';
import { moveExpenseToGroup, getGroupDetail } from '../../groups/api/groups';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('../../../core/auth/AuthContext', () => ({ useAuth: () => ({ userEmail: 'ada@example.com', accessToken: 't' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn() }),
  useRoute: () => ({ params: {} }),
  useIsFocused: () => true,
}));
jest.mock('../../../core/ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../../tags/hooks/useTagsEnabled', () => ({ useTagsEnabled: () => ({ enabled: false }) }));
jest.mock('../../cards/hooks/useCardCoachEnabled', () => ({ useCardCoachEnabled: () => ({ enabled: false }) }));
jest.mock('../../cards/components/CardPickerField', () => () => null);
jest.mock('../../tags/components/TagPickerModal', () => () => null);
jest.mock('../components/ExpenseQuickSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return (p: any) => <Text onPress={() => p.onMove?.({ row_id: 7, cost: 30, description: 'Hotel' })}>open move</Text>;
});
jest.mock('../../groups/components/SplitEditor', () => {
  const actual = jest.requireActual('../../groups/components/SplitEditor');
  const { Text } = jest.requireActual('react-native');
  return {
    ...actual,
    __esModule: true,
    default: (p: any) => (
      <Text onPress={() => p.onChange({ type: 'shares', entries: [{ member_id: 'me', value: NaN }, { member_id: 'bob', value: 1 }] })}>type unclear</Text>
    ),
  };
});
jest.mock('../api/expenses', () => ({ ...jest.requireActual('../api/expenses'), listAllExpenses: jest.fn(async () => []) }));
jest.mock('../../groups/api/groups', () => ({
  ...jest.requireActual('../../groups/api/groups'),
  listGroups: jest.fn(async () => [{ group_id: 'g1', name: 'Trip' }]),
  listAllMyGroupExpenses: jest.fn(async () => []),
  getGroupDetail: jest.fn(async () => ({ group_id: 'g1', members: [{ member_id: 'me' }] })),
  moveExpenseToGroup: jest.fn(async () => ({})),
}));
jest.mock('../../recurring/api/recurring', () => ({
  listRecurringTemplates: jest.fn(),
  upsertRecurringTemplate: jest.fn(async () => ({})),
  executeRecurringNow: jest.fn(),
}));

let client: QueryClient;
const mount = () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(<QueryClientProvider client={client}><ExpensesScreen /></QueryClientProvider>);
};
afterEach(() => client.clear());
beforeEach(() => {
  (upsertRecurringTemplate as jest.Mock).mockClear();
  (listRecurringTemplates as jest.Mock).mockResolvedValue([
    { id: 't1', description: 'Rent', category: 'Home', day_of_month: 5, default_cost: 900, start_date_iso: '2026-01-05', status: 'Active' },
  ]);
});

const editRecurring = async (typed: string) => {
  mount();
  fireEvent.press(screen.getByText('Recurring'));
  fireEvent.press(await screen.findByText('Rent'));
  fireEvent.press(await screen.findByText('✎ Edit'));
  fireEvent.changeText(screen.getByTestId('recurring.editAmount'), typed);
  await act(async () => { fireEvent.press(screen.getByText('Save changes')); });
};

describe('the inline recurring edit', () => {
  it('saves a comma decimal as typed', async () => {
    await editRecurring('12,50');
    await waitFor(() => expect(upsertRecurringTemplate).toHaveBeenCalled());
    expect((upsertRecurringTemplate as jest.Mock).mock.calls[0][0]).toMatchObject({ default_cost: 12.5 });
  });

  it.each(['1,234.50', '12.345'])('saves nothing for %s', async (typed) => {
    await editRecurring(typed);
    expect(upsertRecurringTemplate).not.toHaveBeenCalled();
  });
});

describe('moving to a group', () => {
  it('sends nothing while a split amount is unclear', async () => {
    mount();
    fireEvent.press(await screen.findByText('open move'));
    fireEvent.press(await screen.findByText('Trip'));
    await waitFor(() => expect(getGroupDetail).toHaveBeenCalled());
    fireEvent.press(await screen.findByText('type unclear'));
    await act(async () => { fireEvent.press(screen.getByText('Move')); });
    expect(moveExpenseToGroup).not.toHaveBeenCalled();
  });
});
