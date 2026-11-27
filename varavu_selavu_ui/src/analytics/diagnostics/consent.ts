/**
 * Independent Performance Diagnostics consent for web (TS-OBS-001 AC-09).
 *
 * - Off by default (`null` or `'denied'`).
 * - Stored under its own key (`vs_diagnostics_consent_v1`) — never reads or reinterprets
 *   the behavioral analytics key (`vs_analytics_consent`).
 * - Withdrawal takes effect immediately in memory and notifies listeners BEFORE touching
 *   localStorage, so storage errors cannot keep diagnostics running.
 */

export type DiagnosticsConsentChoice = 'granted' | 'denied' | null;

export const DIAGNOSTICS_STORAGE_NAME = 'vs_diagnostics_consent_v1';
export const DIAGNOSTICS_CONSENT_CHANGED = 'ts-diagnostics-consent-changed';
export const DIAGNOSTICS_CONSENT_COPY =
  'Share technical timings and error categories to help improve reliability. ' +
  'Expense details, messages and account identifiers are not included.';

type Listener = (choice: DiagnosticsConsentChoice) => void;

let memoryChoice: DiagnosticsConsentChoice | undefined;
const listeners = new Set<Listener>();

function readStorage(): DiagnosticsConsentChoice {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(DIAGNOSTICS_STORAGE_NAME);
    return raw === 'granted' || raw === 'denied' ? raw : null;
  } catch {
    return null;
  }
}

export function getDiagnosticsConsent(): DiagnosticsConsentChoice {
  if (memoryChoice !== undefined) return memoryChoice;
  memoryChoice = readStorage();
  return memoryChoice;
}

export function isDiagnosticsConsented(): boolean {
  return getDiagnosticsConsent() === 'granted';
}

/**
 * Set performance diagnostics consent. Applies immediately in memory and notifies listeners
 * before attempting storage persistence. Returns `true` if persisted to storage.
 */
export function setDiagnosticsConsent(next: 'granted' | 'denied'): boolean {
  memoryChoice = next;
  notify(next);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(DIAGNOSTICS_STORAGE_NAME, next);
      return true;
    }
    return false;
  } catch {
    // If granting failed to persist, keep it off rather than claiming it was saved;
    // if withdrawing failed to persist, keep it denied in memory for this session.
    if (next === 'granted') {
      memoryChoice = 'denied';
      notify('denied');
    }
    return false;
  }
}

export function subscribeDiagnosticsConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(choice: DiagnosticsConsentChoice): void {
  listeners.forEach((fn) => {
    try {
      fn(choice);
    } catch {
      // Listener errors must never break consent changes.
    }
  });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(DIAGNOSTICS_CONSENT_CHANGED, { detail: choice }));
    } catch {
      // Ignore in non-DOM test environments.
    }
  }
}

/** Test helper: resets cached in-memory consent state. */
export function resetDiagnosticsConsentForTests(): void {
  memoryChoice = undefined;
  listeners.clear();
}
