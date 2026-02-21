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
            // Persist the new tokens
            await SecureStore.setItemAsync('access_token', result.access_token);
            if (result.refresh_token) {
                await SecureStore.setItemAsync('refresh_token', result.refresh_token);
            }
            return result.access_token;
        } catch {
            return null;
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
 */
export async function apiFetch(
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    const token = await SecureStore.getItemAsync('access_token');

    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    let response = await fetch(url, { ...options, headers });

    // On 401, attempt refresh and retry once
    if (response.status === 401) {
        const newToken = await attemptRefresh();
        if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
            response = await fetch(url, { ...options, headers });
        }

        // If still 401 after refresh (or refresh failed), force logout
        if (response.status === 401 || !newToken) {
            forceLogout();
        }
    }

    return response;
}
