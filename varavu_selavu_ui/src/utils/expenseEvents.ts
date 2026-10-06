/**
 * Lightweight cross-page "an expense was added/changed" signal (TS-DES-111).
 *
 * The global Add Expense FAB (MainLayout.tsx) can be opened from any route,
 * but not every page fetches its data via react-query — DashboardPage manages
 * its own fetches with plain useState/useEffect, so invalidating a react-query
 * cache key alone doesn't reach it. A window CustomEvent notifies any
 * currently-mounted page regardless of how it fetches its own data.
 */
const EVENT_NAME = 'vs:expense-changed';

export function notifyExpenseChanged(): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function onExpenseChanged(callback: () => void): () => void {
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}

/** Every cached view that shows expense-derived numbers. React Query matches keys by prefix,
 * so `['expenses']` alone never reached `['expenses-full-for-combined']` — recurring "Run now"
 * left the combined Transactions list (and Analysis, Budgets) stale until a reload. */
const EXPENSE_VIEW_KEYS = [
  'expenses', 'expenses-full-for-combined', 'dashboard-expenses', 'all-group-expenses',
  'analysis', 'budgets', 'change-insights', 'card-coach', 'top-merchants', 'top-items',
  'merchant-detail', 'item-detail', 'groups', 'group-expenses', 'group-balances', 'friend-balances',
];

/** Refresh every expense-derived view after an expense is created/changed outside the page that
 * owns it, and signal pages that fetch without React Query. */
export function refreshExpenseViews(queryClient: { invalidateQueries: (filters: { queryKey: unknown[] }) => unknown }): void {
  for (const key of EXPENSE_VIEW_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
  notifyExpenseChanged();
}
