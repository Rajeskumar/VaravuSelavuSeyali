// src/api/api.ts
import API_BASE_URL from './apiconfig';
import { boundedFetch, requestTimeout, RequestError, SESSION_ENDED_KEY } from './request';
import { refresh as refreshTokens, ApiError } from './auth';
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
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) return false;
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function forceLogout() {
  // Tokens live in HttpOnly cookies and are cleared server-side; only the
  // non-sensitive display identity is ours to remove.
  try { sessionStorage.setItem(SESSION_ENDED_KEY, '1'); } catch { /* storage disabled */ }
  localStorage.removeItem('vs_user');
  window.dispatchEvent(new Event('vs_auth_changed'));
}

export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = requestTimeout(url),
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

  const owner = localStorage.getItem('vs_user');
  const doFetch = (headers: Record<string, string>) => {
    if (navigator.onLine === false) return Promise.reject(new RequestError('You are offline. Reconnect and try again.'));
    return boundedFetch(`${API_BASE_URL}${url}`, { ...options, credentials: 'include', headers }, timeoutMs);
  };

  let response = await doFetch(buildHeaders());

  // TS-GRP-145: on 401, attempt a silent refresh-and-retry-once before giving up.
  // Access tokens are short-lived (~30 min), so this is the normal path after an
  // idle gap rather than an exceptional one.
  if (response.status === 401) {
    if (localStorage.getItem('vs_user') !== owner) throw new RequestError('Your account changed. Please try again.');
    const refreshed = await attemptRefresh();
    if (refreshed) {
      if (localStorage.getItem('vs_user') !== owner) throw new RequestError('Your account changed. Sign in again before continuing.');
      // Rebuilt so the retry picks up the rotated CSRF token.
      response = await doFetch(buildHeaders());
    }
    if (response.status === 401) {
      if (localStorage.getItem('vs_user') !== owner) throw new RequestError('Your account changed. Please try again.');
      forceLogout();
      throw new Error('Session expired');
    }
  }

  return response;
};
