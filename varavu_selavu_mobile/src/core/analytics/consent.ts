import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../auth/storageKeys';
import { logger } from '../logger';
import { analytics, crashReporter } from './index';

export type ConsentCategory = 'analytics' | 'crash';
export type ConsentChoice = 'granted' | 'denied' | null;
export interface ConsentState { analytics: ConsentChoice; crash: ConsentChoice; loaded: boolean }

const KEYS: Record<ConsentCategory, string> = {
  analytics: STORAGE_KEYS.analyticsConsent,
  crash: STORAGE_KEYS.crashConsent,
};

let state: ConsentState = { analytics: null, crash: null, loaded: false };
const listeners = new Set<(s: ConsentState) => void>();
/** Other collectors (crash reporting) apply their own switch when a choice changes. */
const appliers = new Set<(category: ConsentCategory, granted: boolean) => void>();

function applyAnalytics() { analytics.setConsent(state.analytics === 'granted'); }
function applyCrash() { crashReporter.setConsent(state.crash === 'granted'); }
function notify() { for (const l of listeners) { try { l(state); } catch { /* a listener must not break consent */ } } }

/** Registers a collector that follows a category; it is called now and on every change. */
export function registerConsentApplier(apply: (category: ConsentCategory, granted: boolean) => void): void {
  appliers.add(apply);
  if (state.loaded) for (const c of ['analytics', 'crash'] as const) safeApply(apply, c, state[c] === 'granted');
}
function safeApply(apply: (c: ConsentCategory, g: boolean) => void, c: ConsentCategory, g: boolean) {
  try { apply(c, g); } catch { logger.warn('consent applier failed'); }
}
function applyAll(category: ConsentCategory) {
  if (category === 'analytics') applyAnalytics(); else applyCrash();
  for (const a of appliers) safeApply(a, category, state[category] === 'granted');
}

/** Reads the stored choices once at start-up. A read failure means "not asked, nothing collected". */
export async function loadConsent(): Promise<ConsentState> {
  const read = async (key: string): Promise<ConsentChoice> => {
    try {
      const v = await SecureStore.getItemAsync(key);
      return v === 'granted' || v === 'denied' ? v : null;
    } catch { return null; }
  };
  const [a, c] = await Promise.all([read(KEYS.analytics), read(KEYS.crash)]);
  state = { analytics: a, crash: c, loaded: true };
  applyAll('analytics'); applyAll('crash');
  notify();
  return state;
}

/** Resolves true when the choice was also saved to storage; it always applies for this session. */
export async function setConsentChoice(category: ConsentCategory, granted: boolean): Promise<boolean> {
  state = { ...state, [category]: granted ? 'granted' : 'denied', loaded: true };
  applyAll(category); // apply first: withdrawal must take effect even if storage fails
  notify();
  try { await SecureStore.setItemAsync(KEYS[category], granted ? 'granted' : 'denied'); return true; }
  catch { logger.warn('consent could not be saved; it applies for this session'); return false; }
}

export const getConsentState = (): ConsentState => state;
/** True once the person has answered, either way, so the prompt is shown only once. */
export const hasAnswered = (s: ConsentState = state): boolean => s.analytics !== null || s.crash !== null;
export function subscribeConsent(listener: (s: ConsentState) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** Test helper. */
export function resetConsentForTests(): void {
  state = { analytics: null, crash: null, loaded: false };
  listeners.clear(); appliers.clear();
}
