// src/api/api.ts
import API_BASE_URL from './apiconfig';
import { refresh as refreshTokens } from './auth';
import { csrfHeader, needsCsrf } from './csrf';

// TS-GRP-145: single-flight guard so concurrent 401s trigger exactly one refresh call,
// not one per request — same pattern as mobile's apiFetch.ts.
let refreshPromise: Promise<boolean> | null = null;

/** Rotates the session via the HttpOnly refresh cookie. Resolves to whether the
 * caller should retry; there is no token to hand back, since the new access
 * token arrives as a cookie the browser applies for us. */
async function attemptRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      await refreshTokens();
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function forceLogout() {
  // Tokens live in HttpOnly cookies and are cleared server-side; only the
  // non-sensitive display identity is ours to remove.
  localStorage.removeItem('vs_user');
  window.location.href = '/login';
}

export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = 180000,
) => {
  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (needsCsrf(options.method)) {
      Object.assign(headers, csrfHeader());
    }
    return headers;
  };

  const doFetch = async (headers: Record<string, string>) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        // Sends the auth cookies; required for cross-origin API calls.
        credentials: 'include',
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(id);
    }
  };

  let response = await doFetch(buildHeaders());

  // TS-GRP-145: on 401, attempt a silent refresh-and-retry-once before giving up.
  // Access tokens are short-lived (~30 min), so this is the normal path after an
  // idle gap rather than an exceptional one.
  if (response.status === 401) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      // Rebuilt so the retry picks up the rotated CSRF token.
      response = await doFetch(buildHeaders());
    }
    if (response.status === 401) {
      forceLogout();
      throw new Error('Session expired');
    }
  }

  return response;
};
