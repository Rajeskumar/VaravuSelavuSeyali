import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GroupSettingsSheet from './GroupSettingsSheet';
import { createInvite, fetchGroupExportCsv, getNotificationPreferences, updateNotificationPreferences } from '../api/groups';
import { showToast } from '../../../core/ui/Toast';
import { advanceSession } from '../../../core/auth/session';

jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('../../../core/auth/AuthContext', () => ({ useAuth: () => ({ userEmail: 'ada@example.com' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../../core/ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('./SplitEditor', () => () => null);
jest.mock('../api/groups', () => ({
  ...jest.requireActual('../api/groups'),
  fetchGroupExportCsv: jest.fn(),
  createInvite: jest.fn(),
  getNotificationPreferences: jest.fn(async () => ({ muted: false })),
  updateNotificationPreferences: jest.fn(),
}));

const group: any = {
  group_id: 'g1', name: 'Trip', group_type: 'trip', currency: 'USD', simplify_debts: true, status: 'active',
  archived_at: null, deleted_at: null, default_split: null,
  members: [
    { member_id: 'm1', display_name: 'Ada', role: 'admin', status: 'active', user_email: 'ada@example.com' },
    { member_id: 'm2', display_name: 'Bob', role: 'member', status: 'invited', user_email: null, invite_pending: false },
  ],
};

let share: jest.SpyInstance;
let client: QueryClient;
beforeEach(() => {
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
  client = new QueryClient();
  (getNotificationPreferences as jest.Mock).mockResolvedValue({ muted: false });
});
afterEach(() => { share.mockRestore(); client.clear(); });

const mount = () => render(<QueryClientProvider client={client}><GroupSettingsSheet visible onClose={jest.fn()} group={group} /></QueryClientProvider>);

describe('group share after the session changes', () => {
  it('shares the group CSV when the session is unchanged', async () => {
    (fetchGroupExportCsv as jest.Mock).mockResolvedValue('g,csv');
    mount();
    await act(async () => { fireEvent.press(screen.getByText('Export CSV')); });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: 'g,csv' }));
  });

  it("does not open the share sheet with the previous account's group CSV after sign-out", async () => {
    let finish!: (v: string) => void;
    (fetchGroupExportCsv as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount();
    await act(async () => { fireEvent.press(screen.getByText('Export CSV')); });
    advanceSession();
    await act(async () => { finish('private to A'); });
    expect(share).not.toHaveBeenCalled();
  });

  it('does not share an invite link created for the previous account after sign-out', async () => {
    let finish!: (v: { url: string }) => void;
    (createInvite as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount();
    await act(async () => { fireEvent.press(screen.getByText('Share link')); });
    advanceSession();
    await act(async () => { finish({ url: 'https://example.test/join/secret' }); });
    expect(share).not.toHaveBeenCalled();
  });

  it('shows no invite-email result (toast) for a request that finished after sign-out', async () => {
    let finish!: (v: unknown) => void;
    (createInvite as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    (showToast as jest.Mock).mockClear();
    mount();
    await act(async () => { fireEvent.press(screen.getByText('Email invite')); });
    fireEvent.changeText(screen.getByPlaceholderText('Their email'), 'bob@example.test');
    await act(async () => { fireEvent.press(screen.getByText('Send')); });
    advanceSession();
    await act(async () => { finish({ url: 'x' }); });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows no mute error toast for a toggle that failed after sign-out', async () => {
    let fail!: (e: Error) => void;
    (updateNotificationPreferences as jest.Mock).mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    (showToast as jest.Mock).mockClear();
    mount();
    const { Switch } = require('react-native');
    await act(async () => { screen.UNSAFE_getAllByType(Switch)[1].props.onValueChange(true); });
    advanceSession();
    await act(async () => { fail(new Error('401')); });
    expect(showToast).not.toHaveBeenCalled();
  });
});
