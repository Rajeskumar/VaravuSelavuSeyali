/**
 * Mobile performance diagnostics consent, transport, isolation, and logger privacy tests (TS-OBS-001 OBS-14..19, L15).
 */

import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../auth/storageKeys';
import { logger } from '../logger';
import {
  MobileDiagnosticsClient,
  getDiagnosticsConsentState,
  isDiagnosticsConsented,
  loadDiagnosticsConsent,
  resetDiagnosticsConsentForTests,
  setDiagnosticsConsent,
} from './index';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockGetItem = SecureStore.getItemAsync as jest.Mock;
const mockSetItem = SecureStore.setItemAsync as jest.Mock;

describe('Mobile Performance Diagnostics & Safe Logger (TS-OBS-001)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDiagnosticsConsentForTests();
  });

  test('defaults to off and never reinterprets analytics/crash consent', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    await loadDiagnosticsConsent();

    expect(mockGetItem).toHaveBeenCalledWith(STORAGE_KEYS.diagnosticsConsent);
    expect(getDiagnosticsConsentState()).toEqual({ choice: null, loaded: true });
    expect(isDiagnosticsConsented()).toBe(false);

    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const client = new MobileDiagnosticsClient({
      fetcher,
      apiBaseUrl: () => 'http://localhost:18080',
      platform: () => 'ios',
    });
    client.setServerEnabled(true);
    client.setSessionToken('fake-bearer');

    // No pre-consent capture
    expect(client.recordApiCompleted('expense_list', 'success', 150)).toBe(false);
    expect(client.getQueueLength()).toBe(0);
  });

  test('withdrawal immediately clears queue even if SecureStore fails', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await setDiagnosticsConsent(true);

    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const client = new MobileDiagnosticsClient({
      fetcher,
      apiBaseUrl: () => 'http://localhost:18080',
      platform: () => 'android',
    });
    client.setServerEnabled(true);
    client.setSessionToken('fake-bearer');
    expect(client.recordDashboardReady('success', 280)).toBe(true);
    expect(client.getQueueLength()).toBe(1);

    mockSetItem.mockRejectedValueOnce(new Error('Keychain locked'));
    const saved = await setDiagnosticsConsent(false);
    expect(saved).toBe(false);
    expect(isDiagnosticsConsented()).toBe(false);
    expect(client.getQueueLength()).toBe(0);
  });

  test('session switch isolates late prior-session operations and sends Bearer + credentials omit', async () => {
    mockSetItem.mockResolvedValue(undefined);
    await setDiagnosticsConsent(true);

    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const client = new MobileDiagnosticsClient({
      fetcher,
      apiBaseUrl: () => 'http://localhost:18080',
      platform: () => 'ios',
    });
    client.setServerEnabled(true);
    client.setSessionToken('token-account-a');

    const sessA = client.captureSession();
    client.setSessionToken('token-account-b');
    // Late event from account A is rejected
    expect(
      client.recordSaveOutcome('group_expense_create', 'confirmed', 310, { sessionToken: sessA })
    ).toBe(false);

    // Current account B event flushes with Bearer auth & credentials: 'omit'
    expect(client.recordSaveOutcome('group_expense_create', 'unknown', 30000)).toBe(true);
    expect(await client.flush(true)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('http://localhost:18080/api/v1/telemetry/batch');
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-account-b');
    const body = JSON.parse(String(init.body));
    expect(body.events[0]).toMatchObject({
      name: 'save_unknown',
      operation: 'group_expense_create',
      platform: 'ios',
      outcome: 'unknown',
    });
  });

  test('core/logger never prints Error.message or arbitrary strings even in __DEV__', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      logger.error('api failed', new TypeError('SENTINEL_SECRET_EMAIL@example.com'), 'raw-pii-string', 503);
      expect(errSpy).toHaveBeenCalledWith('api failed', 'TypeError', '[omitted]', '503');
      const serialized = JSON.stringify(errSpy.mock.calls);
      expect(serialized).not.toContain('SENTINEL_SECRET_EMAIL');
      expect(serialized).not.toContain('raw-pii-string');
    } finally {
      errSpy.mockRestore();
    }
  });
});
