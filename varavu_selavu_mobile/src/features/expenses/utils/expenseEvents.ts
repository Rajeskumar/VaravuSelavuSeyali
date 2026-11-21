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

/** Query roots that show expense-derived numbers. Recurring "Run now"/confirm only refreshed the
 * templates list, leaving Home, Insights and Budgets on the old totals (web had the same gap). */
const EXPENSE_VIEW_KEYS = [
  'analysis', 'budgets', 'card-coach', 'insights', 'groupExpenses', 'groups', 'group-expenses',
  'group-balances', 'friend-balances', 'activity-feed', 'topMerchants', 'topItems', 'merchantDetail', 'itemDetail',
];

export function refreshExpenseViews(queryClient: { invalidateQueries: (filters: { queryKey: unknown[] }) => unknown }): void {
  for (const key of EXPENSE_VIEW_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
  notifyExpenseChanged();
}
