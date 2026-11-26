import React from 'react';
import { act, render } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import CoreApp from './CoreApp';
import { useAuth } from '../auth/AuthContext';

// CoreApp must mount the real AuthProvider and the per-session query client. Only the screens, fonts and the
// network are stubbed, so this fails if the shared module-level QueryClient comes back.
jest.mock('@expo-google-fonts/instrument-sans', () => ({ useFonts: () => [true] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }: any) => children }));
jest.mock('../theme/ThemeContext', () => ({ ThemeProvider: ({ children }: any) => children, useAppTheme: () => ({ isDark: true }) }));
jest.mock('../analytics/AnalyticsLifecycle', () => () => null);
jest.mock('../analytics', () => ({ crashReporter: { recordError: jest.fn() } }));
jest.mock('../config/appConfig', () => ({ setAppConfig: jest.fn(), getAppConfig: () => ({ auth: { sessionEndedNotice: 'ended' } }) }));
jest.mock('../notifications/notifications', () => ({ registerForPushNotifications: jest.fn(), unregisterPushNotifications: jest.fn(async () => undefined) }));
jest.mock('../auth/authApi', () => ({ login: jest.fn(async () => ({ access_token: 'tok', refresh_token: 'ref' })), register: jest.fn(), logout: jest.fn(async () => undefined) }));
let mockForcedLogout: (() => void) | null = null;
jest.mock('../api/apiFetch', () => ({ setLogoutCallback: (cb: () => void) => { mockForcedLogout = cb; } }));
jest.mock('expo-secure-store', () => {
  const data = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => data.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { data.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { data.delete(k); }),
  };
});

let mockAuth: ReturnType<typeof useAuth>;
let mockClient: QueryClient;
jest.mock('./RootNavigator', () => {
  const { useAuth: useRealAuth } = jest.requireActual('../auth/AuthContext');
  const { useQueryClient: useRealQueryClient } = jest.requireActual('@tanstack/react-query');
  const Stub = () => { mockAuth = useRealAuth(); mockClient = useRealQueryClient(); return null; };
  return { __esModule: true, default: Stub };
});

const props: any = { config: {} };

async function signedIn(email: string) {
  await act(async () => { await mockAuth.signIn({ username: email, password: 'pw' } as any); });
}

describe('CoreApp session cache', () => {
  afterEach(() => { mockClient?.clear(); });

  it('gives the next account an empty cache after an explicit sign-out', async () => {
    render(<CoreApp {...props} />);
    await signedIn('a@example.test');
    const first = mockClient;
    first.setQueryData(['profile'], { email: 'a@example.test' });
    await act(async () => { await mockAuth.signOut(); });
    await signedIn('b@example.test');
    expect(mockClient).not.toBe(first);
    expect(mockClient.getQueryData(['profile'])).toBeUndefined();
    expect(first.getQueryCache().getAll()).toHaveLength(0);
  });

  it('also replaces the cache on a forced (401) sign-out', async () => {
    render(<CoreApp {...props} />);
    await signedIn('a@example.test');
    const first = mockClient;
    first.setQueryData(['groups'], [{ name: 'private to A' }]);
    await act(async () => { mockForcedLogout!(); });
    await signedIn('b@example.test');
    expect(mockClient).not.toBe(first);
    expect(mockClient.getQueryData(['groups'])).toBeUndefined();
  });
});
