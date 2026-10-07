import { fetchWithAuth } from './api';
import { refresh, ApiError } from './auth';
import { RequestError } from './request';
jest.mock('./auth', () => ({ ...jest.requireActual('./auth'), refresh: jest.fn() }));
const refreshMock = refresh as jest.Mock;
beforeEach(() => { localStorage.setItem('vs_user', 'user'); });
afterEach(() => { localStorage.clear(); sessionStorage.clear(); jest.clearAllMocks(); });

test('a transient refresh failure retains the session and does not retry the write', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401 });
  refreshMock.mockRejectedValue(new RequestError('Server unavailable', false, 503));
  await expect(fetchWithAuth('/expenses', { method: 'POST' })).rejects.toThrow('Server unavailable');
  expect(localStorage.getItem('vs_user')).toBe('user');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('rejected refresh ends authentication with recoverable UI feedback', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401 });
  refreshMock.mockRejectedValue(new ApiError('Expired', 401));
  const listener = jest.fn(); window.addEventListener('vs_auth_changed', listener);
  await expect(fetchWithAuth('/expenses')).rejects.toThrow('Session expired');
  expect(localStorage.getItem('vs_user')).toBeNull();
  expect(sessionStorage.getItem('vs_session_ended')).toBe('1');
  expect(listener).toHaveBeenCalled(); window.removeEventListener('vs_auth_changed', listener);
});

test('concurrent rejected access tokens use one refresh and retry only once each', async () => {
  let complete!: () => void;
  refreshMock.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
  global.fetch = jest.fn().mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 401 }).mockResolvedValue({ status: 200 });
  const a = fetchWithAuth('/a'); const b = fetchWithAuth('/b');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(refreshMock).toHaveBeenCalledTimes(1); complete();
  await Promise.all([a, b]); expect(fetch).toHaveBeenCalledTimes(4);
});

test('a rejected refresh from an old account cannot sign out the new account', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401 });
  refreshMock.mockImplementation(async () => {
    localStorage.setItem('vs_user', 'new-account');
    throw new ApiError('Expired', 401);
  });
  await expect(fetchWithAuth('/expenses')).rejects.toThrow(/account changed/i);
  expect(localStorage.getItem('vs_user')).toBe('new-account');
  expect(sessionStorage.getItem('vs_session_ended')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
