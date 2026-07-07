/**
 * Lightweight cross-screen "an expense was added/changed" signal (TS-DES-112).
 *
 * The global "+" (AddExpenseProvider in AddExpenseScreen.tsx) renders as a plain RN Modal
 * sibling to the navigator, not a navigator screen — so `useIsFocused()` never toggles when it
 * opens or closes. HomeScreen/ExpensesScreen/AnalysisScreen all refetch only on focus-change, so
 * none of them would otherwise reflect an expense added from elsewhere until the app is
 * backgrounded or the screen is manually pulled to refresh.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyExpenseChanged(): void {
  listeners.forEach((listener) => listener());
}

export function onExpenseChanged(callback: Listener): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
