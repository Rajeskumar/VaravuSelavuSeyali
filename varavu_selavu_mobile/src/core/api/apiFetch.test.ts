import { apiFetch, setLogoutCallback } from './apiFetch';
import { refresh } from '../auth/authApi';
import { RequestError } from './request';
import { advanceSession, runTokenWrite } from '../auth/session';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

jest.mock('../auth/authApi', () => ({ refresh: jest.fn() }));
let mockGate: Promise<void> | null = null;
jest.mock('expo-secure-store', () => {
  const data = new Map();
  return {
    getItemAsync: jest.fn(async (key) => data.get(key) || null),
    setItemAsync: jest.fn(async (key, value) => { if (mockGate) await mockGate; data.set(key, value); }),
    deleteItemAsync: jest.fn(async (key) => { data.delete(key); }),
  };
});
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));
const refreshMock = refresh as jest.Mock;
const networkMock = NetInfo.fetch as jest.Mock;
const logout = jest.fn();
beforeEach(async () => {
  jest.clearAllMocks();
  await SecureStore.setItemAsync('access_token', 'old');
  await SecureStore.setItemAsync('refresh_token', 'refresh');
  await SecureStore.setItemAsync('user_email', 'user');
  setLogoutCallback(logout);
  networkMock.mockResolvedValue({ isConnected: true });
});

test('offline writes do not reach the server or end the session', async () => {
  global.fetch = jest.fn();
  networkMock.mockResolvedValue({ isConnected: false });
  await expect(apiFetch('/expenses', { method: 'POST' })).rejects.toMatchObject({ outcomeUnknown: false });
  expect(fetch).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled();
});

test('temporary refresh failure preserves authentication without replaying a write', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401 });
  refreshMock.mockRejectedValue(new RequestError('Unavailable', false, 503));
  await expect(apiFetch('/expenses', { method: 'POST' })).rejects.toThrow('Unavailable');
  expect(logout).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
});

test('rejected refresh ends the session with an actionable error', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401 });
  refreshMock.mockRejectedValue(new RequestError('Expired', false, 401));
  await expect(apiFetch('/expenses')).rejects.toThrow(/session ended/);
  expect(logout).toHaveBeenCalledTimes(1);
});

test('successful refresh retries once using Bearer auth without cookies', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 200 });
  refreshMock.mockResolvedValue({ access_token: 'new', refresh_token: 'rotated' });
  await apiFetch('/expenses');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ credentials: 'omit', headers: expect.objectContaining({ Authorization: 'Bearer new' }) }));
});

test('a rejected refresh from an old account cannot sign out the new account', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401 });
  refreshMock.mockImplementation(async () => {
    await SecureStore.setItemAsync('user_email', 'new-account');
    throw new RequestError('Expired', false, 401);
  });
  await expect(apiFetch('/expenses')).rejects.toThrow(/account changed/i);
  expect(logout).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('sign-out between the refresh check and its token writes leaves no tokens behind', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401 });
  refreshMock.mockResolvedValue({ access_token: 'late', refresh_token: 'late-rotated' });
  let release!: () => void;
  const call = apiFetch('/expenses').catch((e) => e);
  // Let the refresh result arrive and its first write start, then hold that write open.
  mockGate = new Promise<void>((r) => { release = r; });
  await new Promise((r) => setTimeout(r, 0));
  // Sign-out exactly as AuthProvider does it: the deletes go through the shared token-write queue.
  const signOut = runTokenWrite(async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('user_email');
  });
  // Give the deletes every chance to run while the write is held: only the queue may stop them.
  await new Promise((r) => setTimeout(r, 0));
  release(); mockGate = null;
  await Promise.all([call, signOut]);
  expect(await SecureStore.getItemAsync('access_token')).toBeNull();
  expect(await SecureStore.getItemAsync('refresh_token')).toBeNull();
});

test('a refresh result that arrives after the same user signed out and in again is not written', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401 });
  let finish!: (v: { access_token: string; refresh_token: string }) => void;
  refreshMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const call = apiFetch('/expenses').catch((e) => e);
  await new Promise((r) => setTimeout(r, 0));
  // Sign-out and the same user signing in again while the old refresh is still in flight.
  await runTokenWrite(async () => {
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.setItemAsync('access_token', 'second');
    await SecureStore.setItemAsync('refresh_token', 'second-refresh');
  });
  finish({ access_token: 'late', refresh_token: 'late-rotated' });
  const result = await call;
  expect(String(result?.message)).toMatch(/account changed/i);
  expect(await SecureStore.getItemAsync('access_token')).toBe('second');
  expect(await SecureStore.getItemAsync('refresh_token')).toBe('second-refresh');
});

test('a 401 that comes back after the session ended (same user signed out and in again) does not sign the new session out', async () => {
  global.fetch = jest.fn().mockImplementation(async () => {
    advanceSession(); // sign-out and a fresh sign-in of the same user happened while the request was in flight
    return { status: 401 };
  });
  refreshMock.mockRejectedValue(new RequestError('Expired', false, 401));
  await expect(apiFetch('/expenses')).rejects.toThrow(/account changed|session/i);
  expect(logout).not.toHaveBeenCalled();
});
