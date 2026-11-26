import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from './storageKeys';

/**
 * Sign-in session guard. A request that outlives the session that started it (a password change, an export, a
 * save) must not write tokens or show data once the user has signed out, been signed out (401), or someone else
 * has signed in. Capture a guard when the request starts and check it when the result arrives:
 *
 *   const stillSignedIn = sessionGuard();
 *   const csv = await fetchCsv();
 *   if (!stillSignedIn()) return;       // dropped: another session now owns the screen
 *
 * A session ends the moment sign-out begins (explicit or forced), and signing in starts a new one, so the same
 * user signing out and back in is a different session. A token refresh is NOT a session change: it only
 * rotates tokens inside the session that is already running.
 */
let epoch = 0;

export type SessionGuard = () => boolean;

/** Captures the running session. The guard is true only until that session ends. */
export function sessionGuard(): SessionGuard {
  const captured = epoch;
  return () => epoch === captured;
}

/**
 * Ends the running session. AuthProvider calls this synchronously when sign-out starts, when a 401 forces
 * sign-out, and when sign-in succeeds. Features must not call it.
 */
export function advanceSession(): void {
  epoch += 1;
}

// Token writes run one at a time. Two SecureStore writes are never atomic, so a sign-out (or a sign-in) that
// lands between them would otherwise be undone by the writes still to come.
let tail: Promise<unknown> = Promise.resolve();

// A SecureStore call that never answers (a stalled keychain/keystore) must not freeze every later sign-in and sign-out:
// the next task waits for a task at most this long.
const TASK_BUDGET_MS = 10_000;

/**
 * Runs a token mutation after every earlier one has settled, or has had TASK_BUDGET_MS to. A failing task does not
 * block the next.
 */
export function runTokenWrite<T>(task: () => Promise<T>): Promise<T> {
  const turn = tail.then(() => undefined, () => undefined);
  const run = turn.then(task);
  tail = turn.then(() => new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, TASK_BUDGET_MS);
    const done = () => { clearTimeout(timer); resolve(); };
    run.then(done, done);
  }));
  return run;
}

/**
 * Persists re-issued tokens only if the session that asked for them is still the running one. The check happens
 * inside the queue, so a sign-out queued behind the writes deletes them and one queued ahead makes this a no-op.
 * Returns whether anything was written.
 */
export function writeTokensIfSession(
  isCurrent: SessionGuard,
  tokens: { accessToken: string; refreshToken: string },
): Promise<boolean> {
  return runTokenWrite(async () => {
    if (!isCurrent()) return false;
    await SecureStore.setItemAsync(STORAGE_KEYS.accessToken, tokens.accessToken);
    await SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, tokens.refreshToken);
    return true;
  });
}
