import { boundedFetch, requestTimeout, RequestError } from './request';
/**
 * apiFetch — centralized fetch wrapper with 401 interceptor.
 *
 * On a 401 response:
 *  1. Attempt a token refresh using the stored refresh_token.
 *  2. If refresh succeeds, retry the original request with the new access token.
 *  3. If refresh fails, call the registered logout callback to clear state
 *     and redirect the user to the Login screen.
 */
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import API_BASE_URL from './apiconfig';
import { refresh as refreshToken } from './auth';

// Logout callback — registered by AuthContext on mount
let _logoutCallback: (() => void) | null = null;

export function setLogoutCallback(cb: () => void) {
    _logoutCallback = cb;
}

// Flag to prevent multiple concurrent refresh attempts
let _isRefreshing = false;
let _refreshPromise: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
    if (_isRefreshing && _refreshPromise) {
        return _refreshPromise;
    }

    _isRefreshing = true;
    _refreshPromise = (async () => {
        try {
            const storedRefreshToken = await SecureStore.getItemAsync('refresh_token');
            if (!storedRefreshToken) {
                return null;
            }
            const result = await refreshToken(storedRefreshToken);
            if (await SecureStore.getItemAsync('refresh_token') !== storedRefreshToken) throw new RequestError('Your account changed. Please try again.');
            // Persist the new tokens
            await SecureStore.setItemAsync('access_token', result.access_token);
            if (result.refresh_token) {
                await SecureStore.setItemAsync('refresh_token', result.refresh_token);
            }
            return result.access_token;
        } catch (error) {
            if (error instanceof RequestError && [401, 403].includes(error.status || 0)) return null;
            throw error;
        } finally {
            _isRefreshing = false;
            _refreshPromise = null;
        }
    })();

    return _refreshPromise;
}

function forceLogout() {
    if (_logoutCallback) {
        _logoutCallback();
    }
}

/**
 * Authenticated fetch wrapper.
 * Automatically attaches Bearer token and handles 401 with token refresh.
 *
 * `credentials: 'omit'` on every call below is load-bearing, not decoration. The backend's
 * `/auth/login` and `/auth/refresh` set `Set-Cookie: vs_token=...` unconditionally (P0-1's
 * cookie auth is meant for the web client only — see auth/cookies.py's own comment claiming
 * "native clients ... are unaffected"). That claim only holds if the native HTTP stack never
 * stores or resends that cookie. React Native's fetch, unlike a browser's spec default, DOES
 * keep and automatically reattach cookies from a prior Set-Cookie unless told not to — so
 * without `credentials: 'omit'` here, every mobile request after the first login silently
 * carries `vs_token` again. The CSRF double-submit middleware (core/csrf.py) treats *any*
 * request carrying that cookie as cookie-authenticated and demands a matching `X-CSRF-Token`
 * header this Bearer-only client never sends — 403 "CSRF token missing or invalid" on every
 * POST/PUT/PATCH/DELETE (GETs are exempt as a safe method, which is why this only ever showed
 * up on a mutating call like the AI chat send, not on ordinary browsing).
 */
export async function apiFetch(
    path: string,
    options: RequestInit = {},
    timeoutMs = requestTimeout(path),
): Promise<Response> {
    const token = await SecureStore.getItemAsync('access_token');
    const owner = await SecureStore.getItemAsync('user_email');

    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    
    // Offline Check
    const networkState = await NetInfo.fetch();
    if (networkState.isConnected === false) {
        throw new RequestError('You are offline. Reconnect and try again.');
    }

    let response = await boundedFetch(url, { ...options, headers, credentials: 'omit' }, timeoutMs);

    // On 401, attempt refresh and retry once
    if (response.status === 401) {
        if (await SecureStore.getItemAsync('user_email') !== owner) throw new RequestError('Your account changed. Please try again.');
        const newToken = await attemptRefresh();
        if (await SecureStore.getItemAsync('user_email') !== owner) throw new RequestError('Your account changed. Please try again.');
        if (newToken) {
            if (await SecureStore.getItemAsync('access_token') !== newToken) throw new RequestError('Your account changed. Sign in again before continuing.');
            headers['Authorization'] = `Bearer ${newToken}`;
            response = await boundedFetch(url, { ...options, headers, credentials: 'omit' }, timeoutMs);
        }

        // If still 401 after refresh (or refresh failed), force logout
        if (response.status === 401 || !newToken) {
            if (await SecureStore.getItemAsync('user_email') !== owner) throw new RequestError('Your account changed. Please try again.');
            forceLogout();
            throw new RequestError('Your session ended. Sign in again to continue.', false, 401);
        }
    }

    return response;
}
