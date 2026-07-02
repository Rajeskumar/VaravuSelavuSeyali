import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider as MuiThemeProvider, PaletteMode } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { getTheme } from '../theme';

const STORAGE_KEY = 'vs_theme_mode';

interface ThemeModeContextType {
  mode: PaletteMode;
  isDark: boolean;
  isSystemDefault: boolean;
  toggleMode: () => void;
  setMode: (mode: PaletteMode) => void;
  useSystemTheme: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextType | undefined>(undefined);

function getSystemMode(): PaletteMode {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export const ThemeModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [override, setOverride] = useState<PaletteMode | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  });
  const [systemMode, setSystemMode] = useState<PaletteMode>(getSystemMode());

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setSystemMode(getSystemMode());
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  const mode: PaletteMode = override ?? systemMode;

  const setMode = (next: PaletteMode) => {
    setOverride(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const toggleMode = () => setMode(mode === 'dark' ? 'light' : 'dark');

  const useSystemTheme = () => {
    setOverride(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const theme = useMemo(() => getTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider
      value={{
        mode,
        isDark: mode === 'dark',
        isSystemDefault: override === null,
        toggleMode,
        setMode,
        useSystemTheme,
      }}
    >
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeModeContext.Provider>
  );
};

export const useThemeMode = (): ThemeModeContextType => {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
};
