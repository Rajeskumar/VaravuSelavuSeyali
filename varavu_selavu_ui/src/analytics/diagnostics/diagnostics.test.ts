/**
 * Web performance diagnostics consent, transport, isolation, and privacy tests (TS-OBS-001 OBS-14, 17, 18, 19).
 */

import {
  DIAGNOSTICS_STORAGE_NAME,
  WebDiagnosticsClient,
  getDiagnosticsConsent,
  isDiagnosticsConsented,
  resetDiagnosticsConsentForTests,
  setDiagnosticsConsent,
} from './index';

describe('Web Performance Diagnostics (TS-OBS-001)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetDiagnosticsConsentForTests();
  });

  test('defaults to off and never reinterprets existing analytics consent', () => {
    localStorage.setItem('vs_analytics_consent', 'granted');
    expect(getDiagnosticsConsent()).toBeNull();
    expect(isDiagnosticsConsented()).toBe(false);

    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const client = new WebDiagnosticsClient({ fetcher });
    client.setServerEnabled(true);
    client.setSignedIn(true);

    // Pre-consent events are never captured or buffered
    expect(client.recordApiCompleted('expense_list', 'success', 120)).toBe(false);
    expect(client.getQueueLength()).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();

    // Granting later does NOT replay prior operations
    expect(setDiagnosticsConsent('granted')).toBe(true);
    expect(localStorage.getItem(DIAGNOSTICS_STORAGE_NAME)).toBe('granted');
    expect(client.getQueueLength()).toBe(0);
  });

  test('withdrawal immediately clears queue even if localStorage throws', () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const client = new WebDiagnosticsClient({ fetcher });
    client.setServerEnabled(true);
    client.setSignedIn(true);
    setDiagnosticsConsent('granted');

    expect(client.recordDashboardReady('success', 350)).toBe(true);
    expect(client.getQueueLength()).toBe(1);

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(setDiagnosticsConsent('denied')).toBe(false);
      expect(isDiagnosticsConsented()).toBe(false);
      expect(client.getQueueLength()).toBe(0);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  test('account/session change clears queue and rejects late prior-session events', () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const client = new WebDiagnosticsClient({ fetcher });
    client.setServerEnabled(true);
    client.setSignedIn(true);
    setDiagnosticsConsent('granted');

    const priorSession = client.captureSession();
    expect(client.recordApiCompleted('analysis', 'success', 200, { sessionToken: priorSession })).toBe(true);
    expect(client.getQueueLength()).toBe(1);

    // Sign out / switch account
    client.setSignedIn(false);
    expect(client.getQueueLength()).toBe(0);

    // New account signs in; late event from priorSession is dropped
    client.setSignedIn(true);
    expect(
      client.recordSaveOutcome('personal_expense_create', 'confirmed', 180, { sessionToken: priorSession })
    ).toBe(false);
    expect(client.getQueueLength()).toBe(0);
  });

  test('flushes safe schema (CLS score vs ms duration) and drops failures without retry', async () => {
    let clock = 1000;
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const client = new WebDiagnosticsClient({
      now: () => clock,
      fetcher,
      apiBaseUrl: () => 'http://localhost:8080',
    });
    client.setServerEnabled(true);
    client.setSignedIn(true);
    setDiagnosticsConsent('granted');

    client.recordWebVital('lcp', 1420);
    client.recordWebVital('cls', 0.042);
    client.recordSaveOutcome('personal_expense_create', 'unknown', 30000);
    client.recordClientError('render', new TypeError('SENTINEL_SECRET_MSG_999'));

    const ok = await client.flush(true);
    expect(ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/v1/telemetry/batch');
    expect(init.credentials).toBe('include');
    const bodyText = String(init.body);
    expect(bodyText).not.toContain('SENTINEL_SECRET_MSG_999');

    const parsed = JSON.parse(bodyText);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.events[0]).toMatchObject({ name: 'web_vital', operation: 'lcp', duration_ms: 1420, unit: 'ms' });
    expect(parsed.events[1]).toMatchObject({ name: 'web_vital', operation: 'cls', value: 0.042, unit: 'score' });
    expect(parsed.events[2]).toMatchObject({ name: 'save_unknown', outcome: 'unknown' });
    expect(parsed.events[3]).toMatchObject({ name: 'client_error', operation: 'render', error_type: 'TypeError' });

    // 404 disables further collection without throwing
    clock += 65_000;
    fetcher.mockResolvedValueOnce({ ok: false, status: 404 });
    client.recordDashboardReady('success', 200);
    expect(await client.flush()).toBe(false);
    expect(client.recordDashboardReady('success', 200)).toBe(false);
  });
});
