import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { login as apiLogin, LoginPayload, register as apiRegister, RegisterPayload, logout as apiLogout } from '../api/auth';
import { setLogoutCallback } from '../api/apiFetch';

interface AuthState {
  accessToken: string | null;
  isLoading: boolean;
  userEmail: string | null;
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
      userEmail: null,
    });
  };

  useEffect(() => {
    // Register the logout callback so apiFetch can force-logout on 401
    setLogoutCallback(() => {
      // Clear state synchronously to trigger navigation reset
      SecureStore.deleteItemAsync('access_token');
      SecureStore.deleteItemAsync('refresh_token');
      SecureStore.deleteItemAsync('user_email');
      setState({
        accessToken: null,
        isLoading: false,
        userEmail: null,
      });
    });

    const bootstrapAsync = async () => {
      let accessToken;
      let userEmail;
      try {
        accessToken = await SecureStore.getItemAsync('access_token');
        userEmail = await SecureStore.getItemAsync('user_email');
      } catch (e) {
        console.error('Failed to restore token', e);
      }
      setState({ accessToken: accessToken || null, isLoading: false, userEmail: userEmail || null });
    };

    bootstrapAsync();
  }, []);

  const signIn = async (payload: LoginPayload) => {
    try {
      const response = await apiLogin(payload);
      await SecureStore.setItemAsync('access_token', response.access_token);
      await SecureStore.setItemAsync('refresh_token', response.refresh_token);

      const email = payload.username;
      await SecureStore.setItemAsync('user_email', email);

      setState({
        accessToken: response.access_token,
        isLoading: false,
        userEmail: email,
      });
    } catch (error) {
      console.error(error);
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
