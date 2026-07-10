// src/api/api.ts
import API_BASE_URL from './apiconfig';
import { refresh as refreshTokens } from './auth';

// TS-GRP-145: single-flight guard so concurrent 401s trigger exactly one refresh call,
// not one per request — same pattern as mobile's apiFetch.ts.
let refreshPromise: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const storedRefreshToken = localStorage.getItem('vs_refresh');
    if (!storedRefreshToken) return null;
    try {
      const result = await refreshTokens(storedRefreshToken);
      localStorage.setItem('vs_token', result.access_token);
      if (result.refresh_token) localStorage.setItem('vs_refresh', result.refresh_token);
      return result.access_token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function forceLogout() {
  localStorage.removeItem('vs_token');
  localStorage.removeItem('vs_refresh');
  localStorage.removeItem('vs_user');
  window.location.href = '/login';
}

export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = 180000,
) => {
  const buildHeaders = (token: string | null): Record<string, string> => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const doFetch = async (headers: Record<string, string>) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${API_BASE_URL}${url}`, { ...options, headers, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  };

  let response = await doFetch(buildHeaders(localStorage.getItem('vs_token')));

  // TS-GRP-145: on 401, attempt a silent refresh-and-retry-once before giving up. The access
  // token expiring (e.g. after a long idle gap) previously hard-logged-out on the very next
  // request instead of transparently renewing, since this path never actually used vs_refresh
  // to get a new access token.
  if (response.status === 401) {
    const newToken = await attemptRefresh();
    if (newToken) {
      response = await doFetch(buildHeaders(newToken));
    }
    if (response.status === 401) {
      forceLogout();
      throw new Error('Session expired');
    }
  }

  return response;
};
