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
