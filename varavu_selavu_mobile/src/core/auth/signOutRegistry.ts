/**
 * Sign-out cleanup registry. Features own state that must not outlive an explicit sign-out (an
 * unsent draft, a consent flag); the app registers a cleanup for each, so core never imports them.
 *
 *  - 'before' cleanups run first, while the access token is still valid.
 *  - 'after' cleanups run once the tokens are gone.
 *
 * They run on an explicit sign-out only. A forced (401) sign-out deliberately skips them so work
 * in progress, such as an expense draft, can be recovered after signing in again.
 * A failing cleanup is logged and never blocks sign-out.
 */
import { logger } from '../logger';

export type SignOutCleanup = () => void | Promise<void>;
export type SignOutPhase = 'before' | 'after';

const cleanups: Record<SignOutPhase, SignOutCleanup[]> = { before: [], after: [] };

export function registerSignOutCleanup(cleanup: SignOutCleanup, phase: SignOutPhase = 'before'): void {
  if (!cleanups[phase].includes(cleanup)) cleanups[phase].push(cleanup);
}

export async function runSignOutCleanups(phase: SignOutPhase): Promise<void> {
  for (const cleanup of cleanups[phase]) {
    try {
      await cleanup();
    } catch (e) {
      logger.warn('Sign-out cleanup failed', e);
    }
  }
}
