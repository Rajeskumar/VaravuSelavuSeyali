import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExpensesScreen from './ExpensesScreen';
import { moveExpenseToGroup, listGroups, getGroupDetail, listAllMyGroupExpenses } from '../../groups/api/groups';

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
jest.mock('../../groups/components/SplitEditor', () => () => null);
// Opens the move dialog for a fixed row, as the quick sheet's "Move" does.
jest.mock('../components/ExpenseQuickSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return (p: any) =>
    p.onMove ? <Text onPress={() => p.onMove({ row_id: 7, cost: 30, description: 'Hotel' })}>open move</Text> : null;
});
jest.mock('../api/expenses', () => ({ ...jest.requireActual('../api/expenses'), listAllExpenses: jest.fn(async () => []) }));
jest.mock('../../groups/api/groups', () => ({
  ...jest.requireActual('../../groups/api/groups'),
  listGroups: jest.fn(),
  listAllMyGroupExpenses: jest.fn(),
  getGroupDetail: jest.fn(),
  moveExpenseToGroup: jest.fn(),
}));

describe('after moving a personal expense to a group (TS-FIX-103)', () => {
  it('reloads the group expenses shown in the list', async () => {
    (listGroups as jest.Mock).mockResolvedValue([{ group_id: 'g1', name: 'Trip' }]);
    (listAllMyGroupExpenses as jest.Mock).mockResolvedValue([]);
    (getGroupDetail as jest.Mock).mockResolvedValue({ group_id: 'g1', members: [{ member_id: 'me' }] });
    (moveExpenseToGroup as jest.Mock).mockResolvedValue({});
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    render(<QueryClientProvider client={client}><ExpensesScreen /></QueryClientProvider>);

    fireEvent.press(await screen.findByText('open move'));
    await waitFor(() => expect(listAllMyGroupExpenses).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByText('Trip'));
    await waitFor(() => expect(getGroupDetail).toHaveBeenCalled());
    await act(async () => { fireEvent.press(screen.getByText('Move')); });

    await waitFor(() => expect(moveExpenseToGroup).toHaveBeenCalled());
    // Reloaded at least once more than the initial load (the screen's own listener may ask again).
    await waitFor(() => expect((listAllMyGroupExpenses as jest.Mock).mock.calls.length).toBeGreaterThan(1));
    client.clear();
  });
});
