import { registerSignOutCleanup } from '../core/auth/signOutRegistry';
import { clearExpenseDraft } from '../features/expenses/utils/expenseDraft';
import { clearAiConsent } from '../features/ask/utils/aiConsent';

let registered = false;

/** Plugs TrackSpense's features into core's extension points. Safe to call more than once. */
export function registerFeatures(): void {
  if (registered) return;
  registered = true;
  // Order matches the previous hard-coded sign-out: draft first (token still valid), consent last.
  registerSignOutCleanup(() => clearExpenseDraft(), 'before');
  registerSignOutCleanup(() => clearAiConsent(), 'after');
}
