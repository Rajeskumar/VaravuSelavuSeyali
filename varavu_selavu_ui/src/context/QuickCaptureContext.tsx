import React from 'react';
import QuickCaptureSheet from '../components/expenses/QuickCaptureSheet';

interface QuickCaptureContextValue {
  /** Opens the shared Quick Capture sheet/dialog. Pass a groupId to pre-select that group as
   * "who" (e.g. a group's own "+ Add expense" button) — omit for the generic entry points
   * (header button, mobile FAB, Expenses page). */
  openQuickCapture: (initialGroupId?: string) => void;
}

const QuickCaptureContext = React.createContext<QuickCaptureContextValue | null>(null);

/**
 * Mounts the single app-wide QuickCaptureSheet instance (TrackSpense v3 design — Quick Capture
 * is the one fast expense-entry surface, reachable from several unrelated places: the header
 * "+ New expense" button, the mobile FAB, ExpensesPage's "Add Expense" button, and a group
 * detail's "+ Add expense" button). A context avoids each of those owning its own dialog state,
 * the same way AskOverlay already has a single instance in App.tsx.
 */
export const QuickCaptureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  const [initialGroupId, setInitialGroupId] = React.useState<string | undefined>(undefined);

  const openQuickCapture = React.useCallback((groupId?: string) => {
    setInitialGroupId(groupId);
    setOpen(true);
  }, []);

  return (
    <QuickCaptureContext.Provider value={{ openQuickCapture }}>
      {children}
      <QuickCaptureSheet open={open} onClose={() => setOpen(false)} initialGroupId={initialGroupId} />
    </QuickCaptureContext.Provider>
  );
};

export function useQuickCapture(): QuickCaptureContextValue {
  const ctx = React.useContext(QuickCaptureContext);
  if (!ctx) throw new Error('useQuickCapture must be used within a QuickCaptureProvider');
  return ctx;
}
