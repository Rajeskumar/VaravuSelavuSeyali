import { onExpenseChanged, refreshExpenseViews } from './expenseEvents';

test('refreshExpenseViews reaches the combined list and the analysis views, and signals pages', () => {
  // LR-04: recurring "Run now" invalidated ['expenses'] only, which doesn't prefix-match
  // ['expenses-full-for-combined'], so the combined Transactions list stayed stale until reload.
  const keys: string[] = [];
  const qc = { invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => { keys.push(String(queryKey[0])); } };
  const heard = jest.fn();
  const off = onExpenseChanged(heard);
  refreshExpenseViews(qc);
  off();
  expect(keys).toEqual(expect.arrayContaining(['expenses', 'expenses-full-for-combined', 'analysis', 'budgets', 'dashboard-expenses', 'all-group-expenses']));
  expect(heard).toHaveBeenCalledTimes(1);
});
