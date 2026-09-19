import { test, expect } from '../fixtures';
import { deterministicExpenseSeeds, EXPECTED_CATEGORY_TOTALS, EXPECTED_TOTAL, taggedCategory } from '../fixtures';
import { todayMDY } from '../helpers';

/**
 * Validates TrackSpense's actual financial math (AnalysisService.analyze — category_totals,
 * total_expenses) against hand-computed expected values from a fixed dataset, not just "a
 * number appeared". See qa/e2e/test-data/deterministic-expenses.json for the fixed amounts.
 *
 * Every amount here has exactly 2 decimal places already, so plain float equality (via
 * toBeCloseTo) is safe — this is not testing rounding behavior, `expenses-api.spec.ts`'s
 * ceiling/precision tests cover that.
 */
test.describe('financial calculations @api @critical', () => {
  test('category totals and grand total match a deterministic seed exactly', async ({ primaryApi }) => {
    const seeds = deterministicExpenseSeeds();
    const created = await Promise.all(seeds.map((s) => primaryApi.createExpense(s)));

    try {
      const analysis = await primaryApi.getAnalysis({ scope: 'personal' });
      const categoryTotals: { category: string; total: number }[] = analysis.category_totals;

      let sumOfOurCategories = 0;
      for (const [originalCategory, expectedTotal] of Object.entries(EXPECTED_CATEGORY_TOTALS)) {
        const tagged = taggedCategory(originalCategory);
        const match = categoryTotals.find((c) => c.category === tagged);
        expect(match, `no category_totals entry for "${tagged}"`).toBeTruthy();
        expect(match!.total, `category total for ${tagged}`).toBeCloseTo(expectedTotal, 2);
        sumOfOurCategories += match!.total;
      }
      expect(sumOfOurCategories).toBeCloseTo(EXPECTED_TOTAL, 2);
    } finally {
      await Promise.all(created.map((c) => primaryApi.deleteExpense(c.row_id)));
    }
  });

  test('deleting an expense removes it from the category total', async ({ primaryApi }) => {
    const category = taggedCategory(`DeleteCheck_${Date.now()}`);
    const first = await primaryApi.createExpense({ category, cost: 30 });
    const second = await primaryApi.createExpense({ category, cost: 15 });

    let analysis = await primaryApi.getAnalysis({ scope: 'personal' });
    let entry = analysis.category_totals.find((c: any) => c.category === category);
    expect(entry.total).toBeCloseTo(45, 2);

    await primaryApi.deleteExpense(first.row_id);
    analysis = await primaryApi.getAnalysis({ scope: 'personal' });
    entry = analysis.category_totals.find((c: any) => c.category === category);
    expect(entry.total).toBeCloseTo(15, 2);

    await primaryApi.deleteExpense(second.row_id);
  });

  test('an update that changes the amount is reflected in the next analysis call', async ({ primaryApi }) => {
    const category = taggedCategory(`UpdateCheck_${Date.now()}`);
    const created = await primaryApi.createExpense({ category, cost: 10 });

    let analysis = await primaryApi.getAnalysis({ scope: 'personal' });
    expect(analysis.category_totals.find((c: any) => c.category === category).total).toBeCloseTo(10, 2);

    await primaryApi.updateExpense(created.row_id, {
      user_id: 'qa',
      cost: 25,
      category,
      description: created.description,
      date: todayMDY(),
    });

    analysis = await primaryApi.getAnalysis({ scope: 'personal' });
    expect(analysis.category_totals.find((c: any) => c.category === category).total).toBeCloseTo(25, 2);

    await primaryApi.deleteExpense(created.row_id);
  });
});
