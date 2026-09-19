import { test, expect } from '../fixtures';
import { todayMDY } from '../helpers';

/**
 * Cross-cutting negative/error-path coverage that doesn't belong to one specific feature
 * file: unauthorized access, malformed requests, invalid/missing resource ids, and file
 * upload safety (core/upload_safety.py's declared-type + magic-byte + size-cap checks).
 */
test.describe('unauthorized access @api @negative', () => {
  for (const path of ['/api/v1/expenses', '/api/v1/budgets', '/api/v1/groups', '/api/v1/cards/mine', '/api/v1/auth/profile']) {
    test(`GET ${path} without credentials is 401`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
    });
  }
});

test.describe('malformed requests @api @negative', () => {
  test('a non-JSON body on a JSON endpoint is rejected, not a 500', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/expenses', {
      data: 'this is not json at all {{{',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBeLessThan(500);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('an unknown extra field is ignored rather than erroring (Pydantic default)', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/expenses', {
      data: {
        user_id: 'qa',
        cost: 5,
        category: 'Food & Dining',
        description: 'QA_E2E_extra_field_probe',
        date: todayMDY(),
        this_field_does_not_exist: 'whatever',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    await primaryApi.deleteExpense(await primaryApi.findExpenseRowIdByDescription(body.expense.description));
  });
});

test.describe('missing / invalid resources @api @negative', () => {
  test('PUT on a nonexistent expense id is 404', async ({ primaryApi }) => {
    const res = await primaryApi.updateExpense('00000000-0000-0000-0000-000000000000', {
      user_id: 'qa',
      cost: 5,
      category: 'Food & Dining',
      description: 'does not exist',
      date: todayMDY(),
    });
    expect(res.status()).toBe(404);
  });

  test('a group balances lookup for a nonexistent group is 403, not a 500', async ({ primaryApi }) => {
    // Not 404: GroupService.require_membership checks "is the caller an active member?"
    // before anything else, so a nonexistent group and a real group the caller isn't in
    // both come back as the same 403 "Not a member of this group" — see groups-api.spec.ts.
    const res = await primaryApi.get('/api/v1/groups/00000000-0000-0000-0000-000000000000/balances');
    expect(res.status()).toBe(403);
  });
});

test.describe('file upload safety @api @negative', () => {
  test('a declared-PNG upload that is not actually PNG bytes is rejected (415)', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/ingest/receipt/parse', {
      multipart: {
        file: {
          name: 'receipt.png',
          mimeType: 'image/png',
          buffer: Buffer.from('this is plain text, not a PNG', 'utf-8'),
        },
      },
    });
    expect(res.status()).toBe(415);
  });

  test('an unsupported file type is rejected (415)', async ({ primaryApi }) => {
    const res = await primaryApi.post('/api/v1/ingest/receipt/parse', {
      multipart: {
        file: {
          name: 'receipt.exe',
          mimeType: 'application/x-msdownload',
          buffer: Buffer.from('MZ fake executable header', 'utf-8'),
        },
      },
    });
    expect(res.status()).toBe(415);
  });

  test('an oversized upload is rejected (413)', async ({ primaryApi }) => {
    // Default MAX_UPLOAD_MB=12 — one byte over 12MB of real PNG-signature bytes.
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const filler = Buffer.alloc(12 * 1024 * 1024 + 1, 0);
    const oversized = Buffer.concat([pngHeader, filler]);
    const res = await primaryApi.post('/api/v1/ingest/receipt/parse', {
      multipart: { file: { name: 'huge.png', mimeType: 'image/png', buffer: oversized } },
    });
    expect(res.status()).toBe(413);
  });
});
