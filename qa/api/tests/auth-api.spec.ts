import { test, expect } from '../fixtures';
import { env, RUN_ID, uniqueSuffix } from '../helpers';
import { QA_USERS } from '../fixtures';

// NOTE: POST /auth/register is rate-limited to 5/hour per IP, shared across this whole CI
// job (global.setup provisions 2 personas once per run, and e2e/tests/auth/registration.spec.ts
// makes 1 more UI-level call) — this file intentionally keeps only the two most valuable
// register-validation cases below, to stay inside that budget. See qa/README.md.

test.describe('auth API @api @critical', () => {
  test('GET /auth/me returns the authenticated user', async ({ primaryApi }) => {
    const me = await primaryApi.me();
    expect(me.email).toBe(QA_USERS.primary.email);
    expect(me).toHaveProperty('csrf_token');
  });

  test('GET /auth/me without credentials is 401', async ({ request }) => {
    const res = await request.get('/api/v1/auth/me');
    expect(res.status()).toBe(401);
  });

  test('POST /auth/login with a bad password is 401', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      form: { username: QA_USERS.primary.email, password: 'wrong-password-entirely' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /auth/login with a malformed body is a 422, not a 500', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', { data: { not: 'the right shape' } });
    expect(res.status()).toBe(422);
  });

  test('a state-changing request without the CSRF header is rejected (403)', async ({ primaryApi }) => {
    // Bypasses AuthedApi's automatic X-CSRF-Token injection on purpose, to prove the
    // double-submit check (CSRFMiddleware) actually rejects a cookie-only request.
    const res = await primaryApi.ctx.post('/api/v1/expenses', {
      data: {
        user_id: 'qa',
        cost: 1,
        category: 'Food & Dining',
        description: 'CSRF probe — must never be created',
        date: '01/01/2030',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('a garbage access token is rejected, not silently accepted', async ({ request }) => {
    const res = await request.get('/api/v1/auth/me', { headers: { Cookie: 'vs_token=not-a-real-jwt' } });
    expect(res.status()).toBe(401);
  });

  test('registering a duplicate email is a generic 400, not a leak of "already exists"', async ({ request }) => {
    const res = await request.post('/api/v1/auth/register', {
      data: { name: 'Dup', email: QA_USERS.primary.email, password: env.QA_USER_PASSWORD },
    });
    expect(res.status()).toBe(400);
  });

  test('registering with a password under 8 chars is a validation error (422)', async ({ request }) => {
    const email = `qa.api.weak.${RUN_ID}.${uniqueSuffix()}@trackspense.qa`;
    const res = await request.post('/api/v1/auth/register', {
      data: { name: 'Weak Pw', email, password: 'short1' },
    });
    expect(res.status()).toBe(422);
  });
});
