const store: Record<string, string> = {};
let mockFailWrites = false;
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { if (mockFailWrites) throw new Error('disk'); store[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete store[k]; }),
}));

import { configureAnalytics } from './index';
import { createRecordingProvider } from './providers/recording';
import { getConsentState, hasAnswered, loadConsent, registerConsentApplier, resetConsentForTests, setConsentChoice } from './consent';

const events = { ping: { feature: 'x', properties: {} } };
let provider: ReturnType<typeof createRecordingProvider>;
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockFailWrites = false;
  resetConsentForTests();
  provider = createRecordingProvider();
  configureAnalytics({ provider, events, platform: 'ios', product: 'demo' });
});

test('nothing is collected and nothing is answered until the person chooses', async () => {
  const s = await loadConsent();
  expect(s).toEqual({ analytics: null, crash: null, loaded: true });
  expect(hasAnswered(s)).toBe(false);
  expect(provider.calls.filter((c) => c.type === 'event')).toEqual([]);
});
test('analytics and crash reports are independent choices', async () => {
  const seen: string[] = [];
  registerConsentApplier((c, g) => seen.push(`${c}:${g}`));
  await loadConsent();
  await setConsentChoice('analytics', true);
  expect(getConsentState()).toMatchObject({ analytics: 'granted', crash: null });
  expect(seen).toContain('analytics:true');
  expect(seen).not.toContain('crash:true');
  await setConsentChoice('crash', true);
  await setConsentChoice('analytics', false);
  expect(getConsentState()).toMatchObject({ analytics: 'denied', crash: 'granted' });
  expect(seen.at(-1)).toBe('analytics:false');
});
test('a stored grant is applied at start-up, a stored denial is not', async () => {
  store.analytics_consent_v1 = 'granted';
  store.crash_consent_v1 = 'denied';
  const seen: string[] = [];
  registerConsentApplier((c, g) => seen.push(`${c}:${g}`));
  await loadConsent();
  expect(provider.calls).toContainEqual({ type: 'collection', enabled: true });
  expect(seen).toEqual(expect.arrayContaining(['analytics:true', 'crash:false']));
});
test('garbage in storage is treated as never asked', async () => {
  store.analytics_consent_v1 = 'yes please';
  const s = await loadConsent();
  expect(s.analytics).toBeNull();
});
test('withdrawal applies immediately even when saving fails', async () => {
  await loadConsent();
  await setConsentChoice('analytics', true);
  mockFailWrites = true;
  await setConsentChoice('analytics', false);
  expect(provider.calls.slice(-2)).toEqual([{ type: 'collection', enabled: false }, { type: 'reset' }]);
  expect(getConsentState().analytics).toBe('denied');
});
test('a failing storage read means nothing is collected', async () => {
  const SecureStore = jest.requireMock('expo-secure-store');
  SecureStore.getItemAsync.mockRejectedValueOnce(new Error('keychain')).mockRejectedValueOnce(new Error('keychain'));
  const s = await loadConsent();
  expect(s).toMatchObject({ analytics: null, crash: null });
  expect(provider.calls.filter((c) => c.type === 'event')).toEqual([]);
});
