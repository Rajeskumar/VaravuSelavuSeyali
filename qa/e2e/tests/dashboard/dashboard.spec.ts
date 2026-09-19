import { test, expect } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../pages/DashboardPage';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';

/**
 * Dashboard tests run against the same shared primary persona every other suite uses, so
 * they assert *deltas* around a known API-seeded change rather than an absolute total —
 * exact whole-account totals are covered in isolation at the API layer
 * (api/tests/analysis-calculations.spec.ts, using uniquely-tagged categories).
 */
test.describe('dashboard @regression', () => {
  // Serial within this file: the delta tests below read/mutate the shared primary persona's
  // total in a read-mutate-read window, and running them concurrently against each other
  // would race. Cross-file interference (another suite touching primary's expenses in that
  // same brief window) is a small residual risk, accepted rather than serializing the whole
  // regression run — see qa/README.md's "shared persona" note.
  test.describe.configure({ mode: 'serial' });

  test('loads without an error state', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await expect(dashboard.totalAmount).toBeVisible();
  });

  test('the total increases by exactly the amount of a newly created expense', async ({ page, primaryApi }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    const before = await dashboard.totalAmountValue();

    const description = qaLabel(`dashboard_delta_${uniqueSuffix()}`);
    const created = await primaryApi.createExpense({ description, cost: 17.5 });

    await dashboard.goto();
    await dashboard.expectLoaded();
    const after = await dashboard.totalAmountValue();

    expect(after - before).toBeCloseTo(17.5, 2);
    await primaryApi.deleteExpense(created.row_id);
  });

  test('the total decreases by exactly the amount of a deleted expense', async ({ page, primaryApi }) => {
    const description = qaLabel(`dashboard_delta_del_${uniqueSuffix()}`);
    const created = await primaryApi.createExpense({ description, cost: 8.25 });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    const before = await dashboard.totalAmountValue();

    await primaryApi.deleteExpense(created.row_id);

    await dashboard.goto();
    await dashboard.expectLoaded();
    const after = await dashboard.totalAmountValue();

    expect(before - after).toBeCloseTo(8.25, 2);
  });

  // Deliberately no "appears in the RECENT feed" test: that feed is capped to the last 6
  // items (RECENT_FEED_LIMIT), and under the shared primary persona (every parallel spec
  // file creates expenses on this same account) another test's expense can legitimately
  // push this one out of the top 6 before the assertion runs — a flake with no real fix
  // short of a dedicated account, which the register-rate-limit budget doesn't allow (see
  // README). The delta tests above already prove the dashboard reacts to changes;
  // expense-crud.spec.ts already proves a created expense is visible in the full list.
});
