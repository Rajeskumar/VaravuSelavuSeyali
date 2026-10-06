import { Alert } from 'react-native';

const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete store[k]; }),
}));

import { AiConsentDeclined, clearAiConsent, ensureAiConsent, hasAiConsent } from './aiConsent';

/** Presses a button on the pending Alert by its label. */
function press(label: string) {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
  call[2].find((b: any) => b.text === label).onPress();
}

beforeEach(async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await clearAiConsent();
});
afterEach(() => jest.restoreAllMocks());

test('the first AI use asks, naming the provider and what is sent', async () => {
  const pending = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  const [title, body] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe('Use AI features?');
  expect(body).toMatch(/Gemini/);
  expect(body).toMatch(/receipt photos/i);
  press('Allow AI features');
  await expect(pending).resolves.toBe(true);
  expect(await hasAiConsent()).toBe(true);
});

test('"Not now" sends nothing and is not remembered as consent', async () => {
  const pending = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  press('Not now');
  await expect(pending).resolves.toBe(false);
  expect(await hasAiConsent()).toBe(false);
});

test('once allowed it never asks again', async () => {
  const first = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  press('Allow AI features');
  await first;
  (Alert.alert as jest.Mock).mockClear();
  await expect(ensureAiConsent()).resolves.toBe(true);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('two callers at once share one prompt', async () => {
  const a = ensureAiConsent();
  const b = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  expect((Alert.alert as jest.Mock).mock.calls).toHaveLength(1);
  press('Allow AI features');
  await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
});

test('signing out forgets the choice so the next account is asked', async () => {
  const p = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  press('Allow AI features');
  await p;
  await clearAiConsent();
  expect(await hasAiConsent()).toBe(false);
});

test('the declined error explains itself', () => {
  expect(new AiConsentDeclined().message).toMatch(/AI features/);
});
