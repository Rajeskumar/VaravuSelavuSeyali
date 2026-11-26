import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfileScreen from './ProfileScreen';
import { getProfile } from '../api/profile';
import { apiFetch } from '../../../core/api/apiFetch';
import { fetchMyDataJson } from '../../../core/auth/accountApi';
import { advanceSession } from '../../../core/auth/session';

jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true, isSystemDefault: true, setMode: jest.fn(), useSystemTheme: jest.fn() }) };
});
jest.mock('../../../core/auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn(), userEmail: 'ada@example.com', accessToken: 'token' }) }));
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
jest.mock('../../budgets/hooks/useBudgetsEnabled', () => ({ useBudgetsEnabled: () => ({ enabled: false }) }));
jest.mock('../../cards/hooks/useCardCoachEnabled', () => ({ useCardCoachEnabled: () => ({ enabled: false }) }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ granted: true })) }));
jest.mock('../../shared/featureFlags', () => ({ getConfig: jest.fn(async () => ({ mcp_enabled: false })) }));
jest.mock('../api/profile', () => ({ getProfile: jest.fn(), updateProfile: jest.fn() }));
jest.mock('../../../core/api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../../core/auth/accountApi', () => ({ fetchMyDataJson: jest.fn() }));

let share: jest.SpyInstance;
let client: QueryClient;
beforeEach(() => {
  (getProfile as jest.Mock).mockResolvedValue({ email: 'ada@example.com', name: 'Ada Lovelace' });
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => { share.mockRestore(); client.clear(); });

const open = async (label: string) => {
  render(<QueryClientProvider client={client}><ProfileScreen navigation={{ navigate: jest.fn() }} /></QueryClientProvider>);
  fireEvent.press(await screen.findByText(label));
};

describe('account export after the session changes', () => {
  it('shares the CSV when the session is unchanged', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => 'a,b' });
    await open('Export data');
    await act(async () => { await Promise.resolve(); });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: 'a,b' }));
  });

  it("does not open the share sheet with the previous account's CSV after sign-out", async () => {
    let finish!: (r: unknown) => void;
    (apiFetch as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await open('Export data');
    advanceSession(); // sign-out
    await act(async () => { finish({ ok: true, text: async () => 'private to A' }); });
    expect(share).not.toHaveBeenCalled();
  });

  it("does not open the share sheet with the previous account's JSON after sign-out", async () => {
    let finish!: (r: string) => void;
    (fetchMyDataJson as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await open('Download all my data');
    advanceSession();
    await act(async () => { finish('{"private":"A"}'); });
    expect(share).not.toHaveBeenCalled();
  });

  it('shares the JSON when the session is unchanged', async () => {
    (fetchMyDataJson as jest.Mock).mockResolvedValue('{"ok":1}');
    await open('Download all my data');
    await act(async () => { await Promise.resolve(); });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: '{"ok":1}' }));
  });
});
