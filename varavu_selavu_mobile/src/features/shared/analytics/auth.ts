import type { AuthEvent } from '../../../core/auth/authObserver';
import { track, safeFailure } from './operations';

const authentication_method = 'password' as const;

/**
 * Maps core's generic auth outcomes to catalog events. An outcome is reported once, after the server
 * answered; a lost reply on registration is `unknown`, and credentials/errors' text are never read.
 */
export function trackAuthEvent(event: AuthEvent): void {
  switch (event.type) {
    case 'register_started': track('signup_started', { authentication_method }); break;
    case 'registered': track('sign_up', { authentication_method }); break;
    case 'register_failed': track('signup_failed', { authentication_method, ...safeFailure(event.error, true) }); break;
    case 'signed_in': track('login', { authentication_method }); break;
    case 'sign_in_failed': track('login_failed', { authentication_method, ...safeFailure(event.error) }); break;
    case 'signed_out': track('logout', {}); break;
  }
}
