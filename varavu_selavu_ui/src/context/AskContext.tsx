import React from 'react';
import AskOverlay from '../components/ask/AskOverlay';

interface AskContextValue {
  /** Opens the shared Ask panel. Pass a query to pre-fill and auto-submit it (e.g. the
   * log-or-ask bar's fallback when it can't parse an expense out of the text) — omit for the
   * plain "Ask AI" header icon, which opens blank. */
  openAsk: (query?: string) => void;
}

const AskContext = React.createContext<AskContextValue | null>(null);

/**
 * Mounts the single app-wide AskOverlay instance (previously local state inside App.tsx's
 * AppContent). Needs to be a context, not local state, now that more than the header icon
 * triggers it — the log-or-ask bar's "not a loggable expense, must be a question" fallback
 * lives inside DashboardPage's component tree (mobile) as well as App.tsx itself (desktop
 * header), both of which need to open the exact same panel. Same shape as
 * QuickCaptureContext.tsx.
 */
export const AskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  const [initialQuery, setInitialQuery] = React.useState<string | undefined>(undefined);
  // Gated on `user` like the original App.tsx local state was — AIAnalystChat isn't meant to
  // mount at all for a logged-out visitor (it fires a getModels() API call on mount).
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  const openAsk = React.useCallback((query?: string) => {
    setInitialQuery(query);
    setOpen(true);
  }, []);

  return (
    <AskContext.Provider value={{ openAsk }}>
      {children}
      {user && <AskOverlay open={open} onClose={() => setOpen(false)} initialQuery={initialQuery} />}
    </AskContext.Provider>
  );
};

export function useAsk(): AskContextValue {
  const ctx = React.useContext(AskContext);
  if (!ctx) throw new Error('useAsk must be used within an AskProvider');
  return ctx;
}
