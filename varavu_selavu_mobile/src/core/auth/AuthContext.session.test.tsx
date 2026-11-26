import React from 'react';
import { act, render } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthContext';
import { sessionGuard, writeTokensIfSession } from './session';
import { registerSignOutCleanup } from './signOutRegistry';
import { logout } from './authApi';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from './storageKeys';

jest.mock('../config/appConfig', () => ({ getAppConfig: () => ({ auth: { sessionEndedNotice: 'ended' } }) }));
jest.mock('../notifications/notifications', () => ({ registerForPushNotifications: jest.fn(), unregisterPushNotifications: jest.fn(async () => undefined) }));
jest.mock('./authApi', () => ({ login: jest.fn(async () => ({ access_token: 'tok', refresh_token: 'ref' })), register: jest.fn(), logout: jest.fn(async () => undefined) }));
let mockForcedLogout: (() => void) | null = null;
jest.mock('../api/apiFetch', () => ({ setLogoutCallback: (cb: () => void) => { mockForcedLogout = cb; } }));
const mockData = new Map<string, string>();
// A write that starts while the gate is set stays open until the gate resolves.
let mockGate: Promise<void> | null = null;
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockData.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { if (mockGate) await mockGate; mockData.set(k, v); }),
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

beforeEach(() => { mockData.clear(); mockGate = null; cleanup.mockClear(); duringBefore.length = 0; });

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

  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  /** A password change whose session check has passed, held open on the first of its two writes. */
  async function holdTokenWrite() {
    let release!: () => void;
    mockGate = new Promise<void>((r) => { release = r; });
    const write = writeTokensIfSession(sessionGuard(), { accessToken: 'late', refreshToken: 'late-refresh' });
    await settle();
    mockGate = null; // later writes are not held; only the queue can make them wait
    return { release, write };
  }

  it('leaves no tokens when sign-out starts while an older token write is half done', async () => {
    mount(); await signIn('a@example.test');
    stillSignedIn = sessionGuard();
    const held = await holdTokenWrite();
    let signedOut!: Promise<void>;
    await act(async () => { signedOut = mockAuth.signOut(); });
    await settle();
    held.release();
    await act(async () => { await Promise.all([held.write, signedOut]); });
    expect(mockData.size).toBe(0);
  });

  it("keeps the new sign-in's tokens when an older token write is still half done", async () => {
    mount(); await signIn('a@example.test');
    const held = await holdTokenWrite();
    let signedIn!: Promise<void>;
    await act(async () => { signedIn = mockAuth.signIn({ username: 'b@example.test', password: 'pw' } as any); });
    await settle();
    held.release();
    await act(async () => { await Promise.all([held.write, signedIn]); });
    expect([mockData.get(STORAGE_KEYS.accessToken), mockData.get(STORAGE_KEYS.refreshToken)]).toEqual(['tok', 'ref']);
    expect(mockData.get(STORAGE_KEYS.userEmail)).toBe('b@example.test');
  });

  it('leaves no tokens when a forced sign-out arrives while a token write is half done', async () => {
    mount(); await signIn('a@example.test');
    const held = await holdTokenWrite();
    const guard = sessionGuard();
    await act(async () => { mockForcedLogout!(); });
    await settle();
    expect(guard()).toBe(false); // at once, while the deletes still wait their turn
    held.release();
    await act(async () => { await held.write; });
    await settle();
    expect(mockData.size).toBe(0);
  });

  // The screens stay usable while sign-out waits on the network, so work can start after it began.
  it('also ends work that started while sign-out was still in progress', async () => {
    let finishLogout!: () => void;
    (logout as jest.Mock).mockImplementationOnce(() => new Promise<void>((r) => { finishLogout = r; }));
    mount(); await signIn('a@example.test');
    let signedOut!: Promise<void>;
    await act(async () => { signedOut = mockAuth.signOut(); });
    await settle();
    const startedDuringSignOut = sessionGuard();
    expect(startedDuringSignOut()).toBe(true);
    await act(async () => { finishLogout(); await signedOut; });
    expect(startedDuringSignOut()).toBe(false); // so a late export is not shared
    // A password change started in that window must not put the tokens back.
    expect(await writeTokensIfSession(startedDuringSignOut, { accessToken: 'late', refreshToken: 'late-refresh' })).toBe(false);
    expect(mockData.size).toBe(0);
  });

  it('refuses a token write that is queued behind the sign-out deletes', async () => {
    let finishLogout!: () => void;
    (logout as jest.Mock).mockImplementationOnce(() => new Promise<void>((r) => { finishLogout = r; }));
    mount(); await signIn('a@example.test');
    let signedOut!: Promise<void>;
    await act(async () => { signedOut = mockAuth.signOut(); });
    await settle();
    const startedDuringSignOut = sessionGuard();
    const held = await holdTokenWrite(); // keeps the deletes waiting in the queue
    await act(async () => { finishLogout(); });
    await settle();
    const behindDeletes = writeTokensIfSession(startedDuringSignOut, { accessToken: 'later', refreshToken: 'later-refresh' });
    held.release();
    let wrote!: boolean;
    await act(async () => { await Promise.all([held.write, signedOut]); wrote = await behindDeletes; });
    expect(wrote).toBe(false);
    expect(mockData.size).toBe(0);
  });

  it('still ends work started during sign-out when a token delete fails', async () => {
    let finishLogout!: () => void;
    (logout as jest.Mock).mockImplementationOnce(() => new Promise<void>((r) => { finishLogout = r; }));
    mount(); await signIn('a@example.test');
    let signOutError!: Promise<unknown>;
    await act(async () => { signOutError = mockAuth.signOut().catch((e) => e); });
    await settle();
    const startedDuringSignOut = sessionGuard();
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain unavailable'));
    let error: unknown;
    await act(async () => { finishLogout(); error = await signOutError; });
    expect(error).toEqual(new Error('keychain unavailable'));
    expect(startedDuringSignOut()).toBe(false);
  });
});
