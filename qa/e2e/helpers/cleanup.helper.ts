import { AuthedApi } from './api.helper';
import { isQaTagged } from './test-data.helper';

/**
 * Best-effort sweep of anything a QA persona created. Not the primary isolation
 * mechanism (CI recreates the whole Postgres service container every run, so
 * there's nothing to sweep there) — this exists so a local dev loop that reuses
 * one long-lived Postgres doesn't accumulate QA_E2E_* clutter across runs.
 * Failures here are logged, never thrown — a flaky cleanup must not fail the suite.
 */
export async function sweepQaData(api: AuthedApi): Promise<void> {
  try {
    const { items } = await api.listExpenses({ limit: '500' });
    for (const expense of items || []) {
      if (isQaTagged(expense.description)) {
        await api.deleteExpense(expense.row_id).catch((e) => console.warn(`cleanup: failed to delete expense ${expense.row_id}: ${e}`));
      }
    }
  } catch (e) {
    console.warn(`cleanup: failed to sweep expenses: ${e}`);
  }

  try {
    const res = await api.get('/api/v1/groups');
    if (res.ok()) {
      const groups = await res.json();
      for (const group of groups || []) {
        if (isQaTagged(group.name)) {
          await api.delete(`/api/v1/groups/${group.group_id}`).catch((e) =>
            console.warn(`cleanup: failed to delete group ${group.group_id}: ${e}`),
          );
        }
      }
    }
  } catch (e) {
    console.warn(`cleanup: failed to sweep groups (groups feature may be disabled): ${e}`);
  }
}
