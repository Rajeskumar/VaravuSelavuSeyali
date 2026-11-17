import { clearExpenseDraft } from '../../features/expenses/utils/expenseDraft';
import { clearAiConsent } from '../../features/ask/utils/aiConsent';
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from './storageKeys';
import { logger } from '../logger';
import { login as apiLogin, LoginPayload, register as apiRegister, RegisterPayload, logout as apiLogout } from './authApi';
import { setLogoutCallback } from '../api/apiFetch';
import { registerForPushNotifications, unregisterPushNotifications } from '../notifications/notifications';

interface AuthState {
  accessToken: string | null;
  isLoading: boolean;
  userEmail: string | null;
  sessionNotice?: string;
}

interface AuthContextType extends AuthState {
  signIn: (payload: LoginPayload) => Promise<void>;
  signUp: (payload: RegisterPayload) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    isLoading: true,
    userEmail: null,
  });

  const signOut = async () => {
    await clearExpenseDraft().catch(() => {});
    // Unregister the push token while the access token is still valid — apiFetch
    // needs it to authenticate the DELETE call.
    await unregisterPushNotifications();

    try {
      const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.refreshToken);
      if (refreshToken) {
        await apiLogout(refreshToken);
      }
    } catch (e) {
      logger.warn('Logout API call failed', e);
    }

    await SecureStore.deleteItemAsync(STORAGE_KEYS.accessToken);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.refreshToken);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.userEmail);
    await clearAiConsent();

    setState({
      accessToken: null,
      isLoading: false,
      userEmail: null,
    });
  };

  useEffect(() => {
    // Register the logout callback so apiFetch can force-logout on 401
    setLogoutCallback(() => {
      // Clear state synchronously to trigger navigation reset
      SecureStore.deleteItemAsync(STORAGE_KEYS.accessToken);
      SecureStore.deleteItemAsync(STORAGE_KEYS.refreshToken);
      SecureStore.deleteItemAsync(STORAGE_KEYS.userEmail);
      setState({
        accessToken: null,
        isLoading: false,
        userEmail: null,
        sessionNotice: 'Your session ended. Sign in again to recover your expense draft. Check Expenses if a save was in progress.',
      });
    });

    const bootstrapAsync = async () => {
      let accessToken;
      let userEmail;
      try {
        accessToken = await SecureStore.getItemAsync(STORAGE_KEYS.accessToken);
        userEmail = await SecureStore.getItemAsync(STORAGE_KEYS.userEmail);
      } catch (e) {
        logger.error('Failed to restore token', e);
      }
      setState({ accessToken: accessToken || null, isLoading: false, userEmail: userEmail || null });

      // "App start" registration (spec §12.3) — covers an already-logged-in user
      // reopening the app, not just a fresh login.
      if (accessToken) {
        registerForPushNotifications();
      }
    };

    bootstrapAsync();
  }, []);

  const signIn = async (payload: LoginPayload) => {
    try {
      const response = await apiLogin(payload);
      await SecureStore.setItemAsync(STORAGE_KEYS.accessToken, response.access_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, response.refresh_token);

      const email = payload.username;
      await SecureStore.setItemAsync(STORAGE_KEYS.userEmail, email);

      setState({
        accessToken: response.access_token,
        isLoading: false,
        userEmail: email,
      });

      registerForPushNotifications();
    } catch (error) {
      logger.error('Sign-in failed', error);
      throw error;
    }
  };

  const signUp = async (payload: RegisterPayload) => {
    await apiRegister(payload);
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut }}>
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
