import { apiFetch, setLogoutCallback } from './apiFetch';
import { refresh } from './auth';
import { RequestError } from './request';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

jest.mock('./auth', () => ({ refresh: jest.fn() }));
jest.mock('expo-secure-store', () => {
  const data = new Map();
  return { getItemAsync: jest.fn(async (key) => data.get(key) || null), setItemAsync: jest.fn(async (key, value) => { data.set(key, value); }) };
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
