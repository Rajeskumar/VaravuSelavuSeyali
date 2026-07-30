/** Double-submit CSRF token handling.
 *
 * The server sets `vs_csrf` as a readable (non-HttpOnly) cookie; we echo it in
 * the X-CSRF-Token header on state-changing requests. A cross-site page can
 * cause our cookies to be sent but cannot read them to build this header.
 */

export const CSRF_COOKIE = 'vs_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function readCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function csrfHeader(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { [CSRF_HEADER]: token } : {};
}

export function needsCsrf(method?: string): boolean {
  return MUTATING_METHODS.has((method ?? 'GET').toUpperCase());
}
