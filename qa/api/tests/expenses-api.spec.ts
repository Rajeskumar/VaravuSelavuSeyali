import { test, expect } from '../fixtures';
import { qaLabel, uniqueSuffix, todayMDY } from '../helpers';

test.describe('expenses API @api @critical', () => {
  test('create → read → update → delete round-trip', async ({ primaryApi }) => {
    const description = qaLabel(`expense_crud_${uniqueSuffix()}`);
    const created = await primaryApi.createExpense({ description, cost: 42.5, category: 'Groceries' });
    expect(created.row_id).toBeTruthy();

    const { items } = await primaryApi.listExpenses();
    const found = items.find((e: any) => e.row_id === created.row_id);
    expect(found).toBeTruthy();
    expect(found.cost).toBeCloseTo(42.5, 2);
    expect(found.category).toBe('Groceries');

    const updateRes = await primaryApi.updateExpense(created.row_id, {
      user_id: 'qa',
      cost: 55.75,
      category: 'Groceries',
      description,
      date: todayMDY(),
    });
    expect(updateRes.ok()).toBeTruthy();
    const updatedBody = await updateRes.json();
    expect(updatedBody.expense.cost).toBeCloseTo(55.75, 2);

    const deleteRes = await primaryApi.deleteExpense(created.row_id);
    expect(deleteRes.ok()).toBeTruthy();

    const { items: afterDelete } = await primaryApi.listExpenses();
    expect(afterDelete.find((e: any) => e.row_id === created.row_id)).toBeUndefined();
  });

  test('list respects limit/offset pagination', async ({ primaryApi }) => {
    const tag = uniqueSuffix();
    const descriptions = await Promise.all(
      [0, 1, 2].map((i) => primaryApi.createExpense({ description: qaLabel(`page_${tag}_${i}`), cost: 1 + i })),
    );
    const page1 = await primaryApi.listExpenses({ limit: '1', offset: '0' });
    expect(page1.items.length).toBe(1);

    for (const d of descriptions) await primaryApi.deleteExpense(d.row_id);
  });

  test('a 404 on delete for a nonexistent expense id', async ({ primaryApi }) => {
    const res = await primaryApi.deleteExpense('00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });

  test('a malformed expense id is rejected, not a 500', async ({ primaryApi }) => {
    // Confirmed application defect, left failing intentionally — see TEST-PLAN.md §7d.
    // ExpenseService.delete_expense (and update_expense, same pattern) catches a
    // non-UUID row_id's ValueError and falls back to querying with the raw string, which
    // Postgres then rejects with "invalid input syntax for type uuid" — an unhandled
    // DataError that surfaces as a bare 500, not the 404 a client-supplied bad id should get.
    const res = await primaryApi.deleteExpense('not-a-uuid');
    expect(res.status()).toBeLessThan(500);
  });

  test('another user cannot delete this user\'s expense (404, not 200/403)', async ({ primaryApi, secondaryApi }) => {
    const description = qaLabel(`expense_owner_check_${uniqueSuffix()}`);
    const created = await primaryApi.createExpense({ description });
    const res = await secondaryApi.deleteExpense(created.row_id);
    expect(res.status()).toBe(404);
    // Confirm it's really still there for the actual owner.
    const { items } = await primaryApi.listExpenses();
    expect(items.some((e: any) => e.row_id === created.row_id)).toBeTruthy();
    await primaryApi.deleteExpense(created.row_id);
  });
});

test.describe('expenses API — validation @api @negative', () => {
  test('a zero amount is rejected (422)', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/expenses', {
      data: { user_id: 'qa', cost: 0, category: 'Food & Dining', description: 'zero', date: todayMDY() },
    });
    expect(res.status()).toBe(422);
  });

  test('a negative amount is rejected (422)', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/expenses', {
      data: { user_id: 'qa', cost: -5, category: 'Food & Dining', description: 'negative', date: todayMDY() },
    });
    expect(res.status()).toBe(422);
  });

  test('an amount above the 1,000,000 ceiling is rejected (422)', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/expenses', {
      data: { user_id: 'qa', cost: 1_000_000.01, category: 'Food & Dining', description: 'too big', date: todayMDY() },
    });
    expect(res.status()).toBe(422);
  });

  test('an amount at exactly the 1,000,000 ceiling is accepted', async ({ primaryApi }) => {
    const description = qaLabel(`expense_ceiling_${uniqueSuffix()}`);
    const created = await primaryApi.createExpense({ description, cost: 1_000_000 });
    expect(created.row_id).toBeTruthy();
    await primaryApi.deleteExpense(created.row_id);
  });

  test('more than 2 decimal places is rejected (422)', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/expenses', {
      data: { user_id: 'qa', cost: 12.345, category: 'Food & Dining', description: 'too precise', date: todayMDY() },
    });
    expect(res.status()).toBe(422);
  });

  test('a missing required field (description) is rejected (422)', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/expenses', {
      data: { user_id: 'qa', cost: 5, category: 'Food & Dining', date: todayMDY() },
    });
    expect(res.status()).toBe(422);
  });

  test('a malformed date is rejected (422)', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/expenses', {
      data: { user_id: 'qa', cost: 5, category: 'Food & Dining', description: 'bad date', date: '2030-01-01' },
    });
    expect(res.status()).toBe(422);
  });

  test('an invalid scope value on /analysis is a 422, not a 500', async ({ primaryApi }) => {
    const res = await primaryApi.get('/api/v1/analysis', { params: { scope: 'not-a-real-scope' } });
    expect(res.status()).toBe(422);
  });
});
