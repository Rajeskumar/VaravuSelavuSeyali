/**
 * Independent Performance Diagnostics consent for mobile (TS-OBS-001 AC-09).
 *
 * - Off by default (`null` or `'denied'`).
 * - Stored under its own SecureStore key (`STORAGE_KEYS.diagnosticsConsent`); never reads
 *   or reinterprets `analyticsConsent` or `crashConsent`.
 * - Withdrawal takes effect immediately in memory BEFORE persisting to SecureStore, so a
 *   storage failure cannot leave diagnostics active.
 */

import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../auth/storageKeys';
import { logger } from '../logger';

export type DiagnosticsConsentChoice = 'granted' | 'denied' | null;

export interface DiagnosticsConsentState {
  choice: DiagnosticsConsentChoice;
  loaded: boolean;
}

export const DIAGNOSTICS_CONSENT_TITLE = 'Performance diagnostics';
export const DIAGNOSTICS_CONSENT_COPY =
  'Share technical timings and error categories to help improve reliability. ' +
  'Expense details, messages and account identifiers are not included.';

let state: DiagnosticsConsentState = { choice: null, loaded: false };
const listeners = new Set<(s: DiagnosticsConsentState) => void>();

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      // Listener errors must never disrupt consent transitions.
    }
  });
}

export async function loadDiagnosticsConsent(): Promise<DiagnosticsConsentState> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEYS.diagnosticsConsent);
    const choice: DiagnosticsConsentChoice =
      raw === 'granted' || raw === 'denied' ? raw : null;
    state = { choice, loaded: true };
  } catch {
    state = { choice: null, loaded: true };
  }
  notify();
  return state;
}

export async function setDiagnosticsConsent(granted: boolean): Promise<boolean> {
  const next: DiagnosticsConsentChoice = granted ? 'granted' : 'denied';
  state = { choice: next, loaded: true };
  notify();
  try {
    await SecureStore.setItemAsync(STORAGE_KEYS.diagnosticsConsent, next);
    return true;
  } catch {
    logger.warn('diagnostics consent could not be saved');
    if (granted) {
      // Do not falsely leave granted if storage failed; withdrawal stays denied in memory.
      state = { choice: 'denied', loaded: true };
      notify();
    }
    return false;
  }
}

export function getDiagnosticsConsentState(): DiagnosticsConsentState {
  return state;
}

export function isDiagnosticsConsented(): boolean {
  return state.choice === 'granted';
}

export function subscribeDiagnosticsConsent(
  listener: (s: DiagnosticsConsentState) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetDiagnosticsConsentForTests(): void {
  state = { choice: null, loaded: false };
  listeners.clear();
}
