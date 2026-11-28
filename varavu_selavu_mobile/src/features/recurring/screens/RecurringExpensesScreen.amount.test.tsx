/** Template and run-now amounts used parseFloat, and the template field dropped its dot while typing (AC-012). */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecurringExpensesScreen from './RecurringExpensesScreen';
import { upsertRecurringTemplate, executeRecurringNow } from '../api/recurring';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('../../../core/ui/ScreenHeader', () => () => null);
jest.mock('../../../core/ui/ScreenWrapper', () => {
  const { View } = jest.requireActual('react-native');
  return ({ children }: any) => <View>{children}</View>;
});
jest.mock('../api/recurring', () => ({
  listRecurringTemplates: jest.fn(async () => [
    { id: 't1', description: 'Rent', category: 'Home', day_of_month: 5, default_cost: 900, start_date_iso: '2026-01-05', status: 'Active' },
  ]),
  upsertRecurringTemplate: jest.fn(async () => ({})),
  executeRecurringNow: jest.fn(async () => ({ success: true })),
  deleteRecurringTemplate: jest.fn(),
}));

const open = async (button: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(<QueryClientProvider client={client}><RecurringExpensesScreen /></QueryClientProvider>);
  fireEvent.press(await screen.findByText(button));
};
const typeKeys = (typed: string) => {
  const field = () => screen.getByPlaceholderText('0.00');
  fireEvent.changeText(field(), '');
  for (const key of typed) fireEvent.changeText(field(), `${field().props.value}${key}`);
  return field().props.value;
};
const press = async (text: string) => { await act(async () => { fireEvent.press(screen.getByText(text)); }); };

let alert: jest.SpyInstance;
beforeEach(() => {
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (upsertRecurringTemplate as jest.Mock).mockClear();
  (executeRecurringNow as jest.Mock).mockClear();
});
afterEach(() => alert.mockRestore());

describe.each([['12.50'], ['12,50']])('typing %s', (typed) => {
  it('saves a template with that amount', async () => {
    await open('✏️ Edit');
    expect(typeKeys(typed)).toBe(typed);
    await press('Save Template');
    expect((upsertRecurringTemplate as jest.Mock).mock.calls[0][0]).toMatchObject({ default_cost: 12.5 });
  });

  it('runs now with that amount', async () => {
    await open('▶ Execute Now');
    expect(typeKeys(typed)).toBe(typed);
    await press('Execute');
    expect(executeRecurringNow).toHaveBeenCalledWith('t1', 12.5);
  });
});

describe.each([['1,234.50'], ['0']])('an unclear or zero amount: %s', (typed) => {
  it('saves no template', async () => {
    await open('✏️ Edit');
    typeKeys(typed);
    await press('Save Template');
    expect(upsertRecurringTemplate).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
  });

  it('runs nothing', async () => {
    await open('▶ Execute Now');
    typeKeys(typed);
    await press('Execute');
    expect(executeRecurringNow).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
  });
});
