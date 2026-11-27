/** Personal edit read amounts with parseFloat: "1,234.50" saved 1 and "12,50" saved 12 (TS-FIX-103, AC-010). */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExpensesScreen from './ExpensesScreen';
import { updateExpense } from '../api/expenses';

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
// Opens the edit sheet for a fixed row, as the quick sheet's "Edit" does.
jest.mock('../components/ExpenseQuickSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return (p: any) => (
    <Text onPress={() => p.onEdit({ row_id: 7, cost: 30, description: 'Hotel', category: 'Other', date: '11/20/2026' })}>open edit</Text>
  );
});
jest.mock('../api/expenses', () => ({
  ...jest.requireActual('../api/expenses'),
  listAllExpenses: jest.fn(async () => []),
  updateExpense: jest.fn(async () => {}),
}));
jest.mock('../../groups/api/groups', () => ({
  ...jest.requireActual('../../groups/api/groups'),
  listGroups: jest.fn(async () => []),
  listAllMyGroupExpenses: jest.fn(async () => []),
}));

const save = async (typed: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(<QueryClientProvider client={client}><ExpensesScreen /></QueryClientProvider>);
  fireEvent.press(await screen.findByText('open edit'));
  fireEvent.changeText(screen.getByTestId('expenseEdit.amount'), typed);
  await act(async () => { fireEvent.press(screen.getByText('Save Changes')); });
  client.clear();
};

beforeEach(() => (updateExpense as jest.Mock).mockClear());

describe('the typed amount in the personal expense edit', () => {
  it('saves a comma decimal as typed', async () => {
    await save('12,50');
    await waitFor(() => expect(updateExpense).toHaveBeenCalled());
    expect((updateExpense as jest.Mock).mock.calls[0][1]).toMatchObject({ cost: 12.5 });
  });

  it.each(['1,234.50', '1,234', '12.345'])('saves nothing for an amount it would misread: %s', async (typed) => {
    await save(typed);
    expect(updateExpense).not.toHaveBeenCalled();
  });
});
