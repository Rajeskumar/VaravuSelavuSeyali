import React from 'react';
import { act, render } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthContext';
import { sessionGuard } from './session';
import { registerSignOutCleanup } from './signOutRegistry';
import { STORAGE_KEYS } from './storageKeys';

jest.mock('../config/appConfig', () => ({ getAppConfig: () => ({ auth: { sessionEndedNotice: 'ended' } }) }));
jest.mock('../notifications/notifications', () => ({ registerForPushNotifications: jest.fn(), unregisterPushNotifications: jest.fn(async () => undefined) }));
jest.mock('./authApi', () => ({ login: jest.fn(async () => ({ access_token: 'tok', refresh_token: 'ref' })), register: jest.fn(), logout: jest.fn(async () => undefined) }));
let mockForcedLogout: (() => void) | null = null;
jest.mock('../api/apiFetch', () => ({ setLogoutCallback: (cb: () => void) => { mockForcedLogout = cb; } }));
const mockData = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockData.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockData.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { mockData.delete(k); }),
}));

let mockAuth: ReturnType<typeof useAuth>;
const Probe = () => { mockAuth = useAuth(); return null; };
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);
const signIn = (email: string) => act(async () => { await mockAuth.signIn({ username: email, password: 'pw' } as any); });

const duringBefore: boolean[] = [];
let stillSignedIn: () => boolean;
const cleanup = jest.fn(async () => { duringBefore.push(stillSignedIn()); });
registerSignOutCleanup(cleanup, 'before');

beforeEach(() => { mockData.clear(); cleanup.mockClear(); duringBefore.length = 0; });

describe('AuthProvider session boundaries', () => {
  it('ends the session as soon as an explicit sign-out begins, before its cleanups run', async () => {
    mount(); await signIn('a@example.test');
    stillSignedIn = sessionGuard();
    await act(async () => { await mockAuth.signOut(); });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(duringBefore).toEqual([false]);
    expect(mockData.size).toBe(0);
  });

  it('a forced (401) sign-out ends the session and clears tokens but still skips the cleanups', async () => {
    mount(); await signIn('a@example.test');
    const guard = sessionGuard();
    await act(async () => { mockForcedLogout!(); });
    expect(guard()).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
    expect(mockData.has(STORAGE_KEYS.accessToken)).toBe(false);
    expect(mockData.has(STORAGE_KEYS.refreshToken)).toBe(false);
    expect(mockData.has(STORAGE_KEYS.userEmail)).toBe(false);
    expect(mockAuth.sessionNotice).toBe('ended');
  });

  it('signing back in as the same user is a new session', async () => {
    mount(); await signIn('a@example.test');
    const first = sessionGuard();
    await act(async () => { await mockAuth.signOut(); });
    await signIn('a@example.test');
    expect(first()).toBe(false);
    expect(sessionGuard()()).toBe(true);
    // Persisted key names are unchanged.
    expect([...mockData.keys()].sort()).toEqual(['access_token', 'refresh_token', 'user_email']);
  });

  it('signing in ends whatever session was captured while signed out', async () => {
    mount(); await signIn('a@example.test');
    await act(async () => { await mockAuth.signOut(); });
    const whileSignedOut = sessionGuard(); // captured after sign-out, before the next sign-in
    await signIn('a@example.test');
    expect(whileSignedOut()).toBe(false);
  });
});
