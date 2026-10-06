import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Consent to send questions and receipt images to a third-party AI provider (Google Gemini).
 * Asked once, the first time something would send data out; stored in the device's secure store.
 * Declining keeps everything else working (local receipt reader, built-in category rules).
 */
const KEY = 'ai_consent_v1';
let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

export class AiConsentDeclined extends Error {
  constructor() {
    super('This needs AI features, which are turned off. You can allow them when asked.');
    this.name = 'AiConsentDeclined';
  }
}

export async function hasAiConsent(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    cached = (await SecureStore.getItemAsync(KEY)) === 'granted';
  } catch {
    cached = false;
  }
  return cached;
}

async function record(granted: boolean): Promise<void> {
  cached = granted;
  try {
    if (granted) await SecureStore.setItemAsync(KEY, 'granted');
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* the choice still applies for this session */
  }
}

/** Forgets the choice, e.g. on sign-out, so the next account on this device is asked itself. */
export async function clearAiConsent(): Promise<void> {
  await record(false);
}

/** Resolves true when allowed (asking first if never asked). Concurrent callers share one prompt. */
export function ensureAiConsent(): Promise<boolean> {
  if (pending) return pending;
  pending = (async () => {
    if (await hasAiConsent()) return true;
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        'Use AI features?',
        "Ask, receipt scanning and category suggestions send data to Google's Gemini AI service, a third party:\n\n" +
          '• your question and the expense, budget and group figures needed to answer it (merchants, descriptions, group and member names, balances)\n' +
          '• receipt photos, only when our own reader isn\'t confident about one\n' +
          '• text you type into a description, to suggest a category\n\n' +
          "We don't send your password or payment details. If you say no, receipts are still read by our own reader and categories come from built-in rules.",
        [
          { text: 'Not now', style: 'cancel', onPress: () => { void record(false); resolve(false); } },
          { text: 'Allow AI features', onPress: () => { void record(true); resolve(true); } },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  })().finally(() => { pending = null; });
  return pending;
}
