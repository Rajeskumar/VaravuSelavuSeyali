/** Double-submit CSRF token handling.
 *
 * The server sets `vs_csrf` as a readable (non-HttpOnly) cookie; the original
 * design was to echo it in the X-CSRF-Token header by reading it straight
 * back out of `document.cookie`. That only works same-origin: frontend
 * (`expense.cerebroos.com`) and backend (`*.run.app`) are cross-site in prod,
 * and `document.cookie` only ever exposes cookies belonging to the *page's
 * own* origin, never a cookie set by a cross-origin response — regardless of
 * SameSite/Secure, browser, or device. (The browser still attaches the
 * cookie correctly to *requests* targeting the backend; that's a separate,
 * origin-agnostic mechanism. Only the JS-read side is origin-scoped.) Net
 * effect: every mutating request 403'd in prod — masked until now behind the
 * SameSite=Strict login-bounce bug, which never let a session live long
 * enough to attempt a write.
 *
 * Fix: keep the token in memory instead, set from the `csrf_token` field
 * every login/refresh/`/auth/me` response already carries in its body (a
 * cross-origin fetch *can* read its own response body — CORS governs that,
 * not cookie domain-scoping). `readCsrfToken()` still falls back to
 * `document.cookie` for same-origin setups (local dev, and prod again once
 * TS-SEC-101 ships), where the cookie read has always worked.
 */

export const CSRF_COOKIE = 'vs_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let inMemoryCsrfToken: string | null = null;

/** Called after every auth response (login/google/refresh/session/me) that
 * carries a `csrf_token` field. */
export function setCsrfToken(token: string | null | undefined): void {
  inMemoryCsrfToken = token ?? null;
}

function readCsrfCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function readCsrfToken(): string | null {
  return inMemoryCsrfToken ?? readCsrfCookie();
}

export function csrfHeader(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { [CSRF_HEADER]: token } : {};
}

export function needsCsrf(method?: string): boolean {
  return MUTATING_METHODS.has((method ?? 'GET').toUpperCase());
}
