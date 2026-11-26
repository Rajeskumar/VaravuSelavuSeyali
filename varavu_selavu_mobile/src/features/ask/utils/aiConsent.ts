import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../../../core/auth/storageKeys';

/**
 * Consent to send questions and receipt images to a third-party AI provider (Google Gemini).
 * Asked once, the first time something would send data out; stored in the device's secure store.
 * Declining keeps everything else working (local receipt reader, built-in category rules).
 */
const KEY = 'ai_consent_v1';
// The stored value names the account that allowed it ("granted:<email>"). A forced (401) sign-out skips the sign-out
// cleanups on purpose, so without the owner the next account on the device would inherit the choice. A bare "granted"
// from an older build recorded no account and is not trusted: whoever is signed in is asked once more.
let cached: { owner: string; granted: boolean } | null = null;
let pending: { owner: string; promise: Promise<boolean> } | null = null;
// Bumped by clearAiConsent so a read that started before the clear cannot bring the cleared choice back into the cache.
let generation = 0;

export class AiConsentDeclined extends Error {
  constructor() {
    super('This needs AI features, which are turned off. You can allow them when asked.');
    this.name = 'AiConsentDeclined';
  }
}

/** The signed-in account, normalised the way the consent is stored; null when nobody is signed in. */
async function currentOwner(): Promise<string | null> {
  try {
    const email = await SecureStore.getItemAsync(STORAGE_KEYS.userEmail);
    return email ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

const grantedBy = (owner: string) => `granted:${owner}`;

export async function hasAiConsent(): Promise<boolean> {
  const owner = await currentOwner();
  if (!owner) return false;
  if (cached && cached.owner === owner) return cached.granted;
  const started = generation;
  let granted = false;
  try {
    granted = (await SecureStore.getItemAsync(KEY)) === grantedBy(owner);
  } catch {
    granted = false;
  }
  if (started === generation) cached = { owner, granted };
  return started === generation ? granted : false;
}

/** Records the answer for `owner`, unless a different account is signed in by now (a prompt can outlive its session). */
async function record(granted: boolean, owner: string): Promise<boolean> {
  if ((await currentOwner()) !== owner) return false;
  cached = { owner, granted };
  try {
    if (granted) await SecureStore.setItemAsync(KEY, grantedBy(owner));
    else if ((await SecureStore.getItemAsync(KEY)) === grantedBy(owner)) await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* the choice still applies for this session */
  }
  return true;
}

/** Forgets the choice, e.g. on explicit sign-out, so the next sign-in is asked again. */
export async function clearAiConsent(): Promise<void> {
  generation += 1;
  cached = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* nothing stored, or the store is unavailable */
  }
}

/** Resolves true when allowed (asking first if never asked). Concurrent callers share one prompt. */
export async function ensureAiConsent(): Promise<boolean> {
  const owner = await currentOwner();
  if (!owner) return false; // nobody is signed in: nothing may be sent
  if (pending && pending.owner === owner) return pending.promise;
  const promise = (async () => {
    if (await hasAiConsent()) return true;
    return new Promise<boolean>((resolve) => {
      const answer = (granted: boolean) => { void record(granted, owner).then((stored) => resolve(stored ? granted : false)); };
      Alert.alert(
        'Use AI features?',
        "Ask, receipt scanning and category suggestions send data to Google's Gemini AI service, a third party:\n\n" +
          '• your question and the expense, budget and group figures needed to answer it (merchants, descriptions, group and member names, balances)\n' +
          '• receipt photos, only when our own reader isn\'t confident about one\n' +
          '• text you type into a description, to suggest a category\n\n' +
          "We don't send your password or payment details. If you say no, receipts are still read by our own reader and categories come from built-in rules.",
        [
          { text: 'Not now', style: 'cancel', onPress: () => answer(false) },
          { text: 'Allow AI features', onPress: () => answer(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  })().finally(() => { if (pending?.promise === promise) pending = null; });
  pending = { owner, promise };
  return promise;
}
