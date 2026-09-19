import { test, expect } from '../fixtures';
import { taggedCategory } from '../fixtures';

test.describe('budgets API @api', () => {
  test('a category budget\'s "spent" tracks the same ledger as /analysis (no second calc path)', async ({ primaryApi }) => {
    const category = taggedCategory(`BudgetTrack_${Date.now()}`);
    const budget = await primaryApi.createBudget({ target_type: 'category', category, amount: 200 });
    expect(budget.id).toBeTruthy();
    expect(budget.spent).toBeCloseTo(0, 2);

    const expense = await primaryApi.createExpense({ category, cost: 37.5 });

    const breakdown = await primaryApi.getBudgetBreakdown(budget.id);
    expect(breakdown.budget.spent).toBeCloseTo(37.5, 2);
    expect(breakdown.budget.remaining).toBeCloseTo(200 - 37.5, 2);
    expect(breakdown.transactions.length).toBeGreaterThan(0);

    await primaryApi.deleteExpense(expense.row_id);
  });

  test('creating a second budget for the same (scope, category) edits in place, not a duplicate', async ({ primaryApi }) => {
    const category = taggedCategory(`BudgetDedupe_${Date.now()}`);
    const first = await primaryApi.createBudget({ target_type: 'category', category, amount: 100 });
    const second = await primaryApi.createBudget({ target_type: 'category', category, amount: 150 });
    expect(second.id).toBe(first.id);
    expect(second.amount).toBeCloseTo(150, 2);
  });

  test('a negative budget amount is rejected', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/budgets', {
      data: { scope: 'personal', target_type: 'overall', amount: -50, currency: 'USD', rollover: false },
    });
    expect(res.status()).toBe(422);
  });

  test('breakdown for a nonexistent budget id is 404', async ({ primaryApi }) => {
    const res = await primaryApi.get('/api/v1/budgets/00000000-0000-0000-0000-000000000000/breakdown');
    expect(res.status()).toBe(404);
  });

  test('another user cannot read this user\'s budget breakdown', async ({ primaryApi, secondaryApi }) => {
    const category = taggedCategory(`BudgetPrivacy_${Date.now()}`);
    const budget = await primaryApi.createBudget({ target_type: 'category', category, amount: 100 });
    const res = await secondaryApi.get(`/api/v1/budgets/${budget.id}/breakdown`);
    expect(res.status()).toBe(404);
  });
});
