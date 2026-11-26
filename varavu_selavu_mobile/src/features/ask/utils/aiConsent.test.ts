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

const signInAs = (email: string | null) => { if (email) store.user_email = email; else delete store.user_email; };

beforeEach(async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  signInAs('a@example.test');
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

// The choice belongs to the account that made it. A forced (401) sign-out skips the sign-out cleanups on purpose, so the
// next account on the device must not inherit it.
async function allowAs(email: string) {
  signInAs(email);
  const p = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  press('Allow AI features');
  await p;
}

test('another account is asked itself, even when the previous one was signed out without cleanups', async () => {
  await allowAs('a@example.test');
  expect(await hasAiConsent()).toBe(true);
  signInAs('b@example.test'); // forced sign-out: no clearAiConsent
  expect(await hasAiConsent()).toBe(false);
  (Alert.alert as jest.Mock).mockClear();
  const pending = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  press('Not now');
  await expect(pending).resolves.toBe(false);
});

test('the same account keeps its choice across a forced sign-out and signing back in, whatever the email case', async () => {
  await allowAs('Ada@Example.test');
  signInAs(null);
  signInAs('ada@example.test');
  (Alert.alert as jest.Mock).mockClear();
  await expect(ensureAiConsent()).resolves.toBe(true);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('allowing on a prompt left open by the previous account does not consent the next one', async () => {
  signInAs('a@example.test');
  const pending = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  signInAs('b@example.test'); // A is signed out (401) while the prompt is still on screen; B signs in
  press('Allow AI features');
  await expect(pending).resolves.toBe(false);
  expect(await hasAiConsent()).toBe(false);
  expect(Object.values(store).some((v) => v.startsWith('granted'))).toBe(false);
});

test('a consent saved by an older build, which recorded no account, is asked again', async () => {
  store['ai_consent_v1'] = 'granted';
  expect(await hasAiConsent()).toBe(false);
});

test('without a signed-in account nothing counts as consent and nothing is stored', async () => {
  signInAs(null);
  expect(await hasAiConsent()).toBe(false);
});

test('without a signed-in account nothing is asked or sent', async () => {
  signInAs(null);
  (Alert.alert as jest.Mock).mockClear();
  await expect(ensureAiConsent()).resolves.toBe(false);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("another account declining does not delete the first account's saved consent", async () => {
  await allowAs('a@example.test');
  signInAs('b@example.test');
  const pending = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  press('Not now');
  await pending;
  signInAs('a@example.test');
  (Alert.alert as jest.Mock).mockClear();
  await expect(ensureAiConsent()).resolves.toBe(true);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('a read still in flight when the choice is cleared does not bring the old choice back', async () => {
  await allowAs('a@example.test');
  const SecureStore = require('expo-secure-store');
  // Drop the in-memory choice, then hold the stored read open while the choice is cleared (explicit sign-out) and the
  // same account signs back in.
  signInAs('a@example.test');
  await clearAiConsent();
  store['ai_consent_v1'] = 'granted:a@example.test'; // what the slow read is about to find
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  (SecureStore.getItemAsync as jest.Mock).mockImplementationOnce(async (k: string) => store[k] ?? null) // user_email
    .mockImplementationOnce(async (k: string) => { const stale = store[k] ?? null; await gate; return stale; }); // the consent read, value taken before the clear
  const read = hasAiConsent();
  await new Promise((r) => setImmediate(r));
  await clearAiConsent(); // explicit sign-out clears the store while the read is in flight
  release();
  await read;
  (Alert.alert as jest.Mock).mockClear();
  const pending = ensureAiConsent();
  await new Promise((r) => setImmediate(r));
  expect(Alert.alert).toHaveBeenCalledTimes(1); // asked again: the cleared choice must not come back from the stale read
  press('Not now');
  await pending;
});
