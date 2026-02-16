import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { login as apiLogin, LoginPayload, register as apiRegister, RegisterPayload, logout as apiLogout, refresh as apiRefresh } from '../api/auth';

interface AuthState {
  accessToken: string | null;
  isLoading: boolean;
  userEmail: string | null;
}

interface AuthContextType extends AuthState {
  signIn: (payload: LoginPayload) => Promise<void>;
  signUp: (payload: RegisterPayload) => Promise<void>;
  signOut: () => Promise<void>;
  getValidToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Decode a JWT payload without a library.
 * Returns the payload object or null on failure.
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    let base64 = token.split('.')[1];
    // Convert base64url to base64 and add padding
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const json = atob(base64);
    return JSON.parse(json);
  } catch (e) {
    console.warn('Failed to decode JWT payload', e);
    return null;
  }
}

/**
 * Check whether a JWT is expired (or will expire within `bufferSec` seconds).
 */
function isTokenExpired(token: string, bufferSec = 60): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true; // treat missing exp as expired
  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp - nowSec < bufferSec;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    isLoading: true,
    userEmail: null,
  });

  // Use a ref so getValidToken always sees the latest token without stale closures
  const tokenRef = useRef<string | null>(null);
  useEffect(() => { tokenRef.current = state.accessToken; }, [state.accessToken]);

  useEffect(() => {
    const bootstrapAsync = async () => {
      console.log('[Auth] Bootstrap: restoring session...');
      let accessToken: string | null = null;
      let userEmail: string | null = null;
      try {
        accessToken = await SecureStore.getItemAsync('access_token');
        userEmail = await SecureStore.getItemAsync('user_email');
        console.log('[Auth] Bootstrap: stored token =', accessToken ? 'found' : 'none', ', email =', userEmail);

        // If we have a stored token but it's expired, try to refresh
        if (accessToken && isTokenExpired(accessToken)) {
          const refreshToken = await SecureStore.getItemAsync('refresh_token');
          if (refreshToken) {
            try {
              const response = await apiRefresh(refreshToken);
              accessToken = response.access_token;
              await SecureStore.setItemAsync('access_token', response.access_token);
              await SecureStore.setItemAsync('refresh_token', response.refresh_token);
            } catch {
              // Refresh failed — clear everything so the user sees the login screen
              accessToken = null;
              await SecureStore.deleteItemAsync('access_token');
              await SecureStore.deleteItemAsync('refresh_token');
              await SecureStore.deleteItemAsync('user_email');
              userEmail = null;
            }
          } else {
            // No refresh token — force re-login
            accessToken = null;
          }
        }
      } catch (e) {
        console.error('Failed to restore token', e);
      }
      console.log('[Auth] Bootstrap complete: accessToken =', accessToken ? 'present' : 'null', ', userEmail =', userEmail);
      setState({ accessToken: accessToken || null, isLoading: false, userEmail: userEmail || null });
    };

    bootstrapAsync();
  }, []);

  const signIn = async (payload: LoginPayload) => {
    console.log('[Auth] signIn: attempting login for', payload.username);
    try {
      const response = await apiLogin(payload);
      console.log('[Auth] signIn: login API succeeded, storing tokens...');
      await SecureStore.setItemAsync('access_token', response.access_token);
      await SecureStore.setItemAsync('refresh_token', response.refresh_token);

      const email = response.email || payload.username;
      await SecureStore.setItemAsync('user_email', email);

      console.log('[Auth] signIn: tokens stored, updating state for', email);
      setState({
        accessToken: response.access_token,
        isLoading: false,
        userEmail: email,
      });
    } catch (error) {
      console.error('[Auth] signIn failed:', error);
      throw error;
    }
  };

  const signUp = async (payload: RegisterPayload) => {
    await apiRegister(payload);
  };

  const signOut = async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (refreshToken) {
        await apiLogout(refreshToken);
      }
    } catch (e) {
      console.warn("Logout API call failed", e);
    }

    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('user_email');

    setState({
      accessToken: null,
      isLoading: false,
      userEmail: null
    });
  };

  /**
   * Returns a valid (non-expired) access token.
   * If the current token is expired it will attempt a silent refresh.
   * On failure it triggers sign-out so the user lands on the login screen.
   */
  const getValidToken = useCallback(async (): Promise<string | null> => {
    const current = tokenRef.current;
    if (!current) return null;

    if (!isTokenExpired(current)) return current;

    // Token expired — attempt refresh
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (!refreshToken) {
        await signOut();
        return null;
      }
      const response = await apiRefresh(refreshToken);
      await SecureStore.setItemAsync('access_token', response.access_token);
      await SecureStore.setItemAsync('refresh_token', response.refresh_token);

      setState(prev => ({
        ...prev,
        accessToken: response.access_token,
      }));

      return response.access_token;
    } catch {
      console.warn('Token refresh failed — signing out');
      await signOut();
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut, getValidToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
