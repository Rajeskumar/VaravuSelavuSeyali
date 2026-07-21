import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AppTheme, ThemeMode, buildTheme, darkTheme, lightTheme } from '../theme';

const STORAGE_KEY = 'vs_theme_preference';

interface ThemeContextType {
  theme: AppTheme;
  mode: ThemeMode;
  isDark: boolean;
  /** True while following the OS appearance instead of a saved override. */
  isSystemDefault: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  useSystemTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useColorScheme();
  const [override, setOverride] = useState<ThemeMode | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
          setOverride(saved);
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const mode: ThemeMode = override ?? (systemScheme === 'dark' ? 'dark' : 'light');

  const setMode = (next: ThemeMode) => {
    setOverride(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  };

  const toggleTheme = () => setMode(mode === 'dark' ? 'light' : 'dark');

  const useSystemTheme = () => {
    setOverride(null);
    SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
  };

  const theme = mode === 'dark' ? darkTheme : lightTheme;

  // Avoid a flash of the wrong theme before the saved preference loads.
  if (!loaded) return null;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mode,
        isDark: mode === 'dark',
        isSystemDefault: override === null,
        setMode,
        toggleTheme,
        useSystemTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within a ThemeProvider');
  return ctx;
};

// Re-exported for screens that only need the shape, not the live value.
export { buildTheme };
export type { AppTheme, ThemeMode };
