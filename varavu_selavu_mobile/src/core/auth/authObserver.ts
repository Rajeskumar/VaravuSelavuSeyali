/**
 * Core reports what happened to a sign-in, registration or sign-out; it does not know about analytics
 * or any product's events. An app registers one observer and decides what, if anything, to record.
 * Observers never see credentials, tokens or the account's email, only the outcome and the error.
 */
export type AuthEvent =
  | { type: 'register_started' }
  | { type: 'registered' }
  | { type: 'register_failed'; error: unknown }
  | { type: 'signed_in' }
  | { type: 'sign_in_failed'; error: unknown }
  /** Deliberate sign-out only; a forced (401) sign-out is not reported. */
  | { type: 'signed_out' };

type Observer = (event: AuthEvent) => void;
let observer: Observer | null = null;

export function registerAuthObserver(next: Observer | null): void { observer = next; }

/** Never throws: an observer can't change what a sign-in does. */
export function notifyAuth(event: AuthEvent): void {
  try { observer?.(event); } catch { /* observers are best-effort */ }
}
