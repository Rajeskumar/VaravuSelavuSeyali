/** The group's default split must not be saved while one of its amounts is unclear (TS-FIX-103, AC-009). */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GroupSettingsSheet from './GroupSettingsSheet';
import { updateGroup } from '../api/groups';

jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('../../../core/auth/AuthContext', () => ({ useAuth: () => ({ userEmail: 'ada@example.com' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../../core/ui/Toast', () => ({ showToast: jest.fn() }));
// Stands in for someone typing an unclear share.
jest.mock('./SplitEditor', () => {
  const { Text } = jest.requireActual('react-native');
  return (p: any) => (
    <Text onPress={() => p.onChange({ type: 'shares', entries: [{ member_id: 'm1', value: NaN }] })}>type unclear</Text>
  );
});
jest.mock('../api/groups', () => ({
  ...jest.requireActual('../api/groups'),
  updateGroup: jest.fn(async () => ({})),
  getNotificationPreferences: jest.fn(async () => ({ muted: false })),
}));

const group: any = {
  group_id: 'g1', name: 'Trip', group_type: 'trip', currency: 'USD', simplify_debts: true, status: 'active',
  archived_at: null, deleted_at: null, default_split: null,
  members: [{ member_id: 'm1', display_name: 'Ada', role: 'admin', status: 'active', user_email: 'ada@example.com' }],
};

it('saves no default split while an amount is unclear', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(<QueryClientProvider client={client}><GroupSettingsSheet visible onClose={jest.fn()} group={group} /></QueryClientProvider>);
  fireEvent.press(screen.getByText('type unclear'));
  await act(async () => { fireEvent.press(screen.getByText('Save Settings')); });
  expect(updateGroup).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Check the amounts', expect.any(String));
  client.clear();
  alert.mockRestore();
});
