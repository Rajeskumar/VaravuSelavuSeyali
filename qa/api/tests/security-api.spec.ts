import { test, expect } from '../../e2e/fixtures/auth.fixture';

/**
 * Response hygiene from the 2026-10-06 security and privacy review. Uses the already-signed-in
 * personas only: no new logins or registrations, so the auth rate-limit budget is untouched.
 */
test.describe('security headers and error hygiene @api', () => {
  test('API responses carry security headers and are not cacheable', async ({ primaryApi }) => {
    const res = await primaryApi.get('/api/v1/auth/me');
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['strict-transport-security']).toContain('max-age');
    expect(h['referrer-policy']).toBeTruthy();
    expect(h['cache-control']).toBe('no-store');
  });

  test('a validation error does not echo what was submitted', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', { data: { username: 'qa-echo-probe@example.com', password: 'qa-echo-secret-value' } });
    expect(res.status()).toBe(422);
    const text = await res.text();
    expect(text).not.toContain('qa-echo-secret-value');
    expect(text).not.toContain('qa-echo-probe');
  });

  test('/auth/me tells the client whether the account has a password', async ({ primaryApi }) => {
    const body = await (await primaryApi.get('/api/v1/auth/me')).json();
    expect(typeof body.has_password).toBe('boolean');
  });
});

test.describe('account data and sessions @api', () => {
  test('"download my data" returns the user\'s data and never credentials', async ({ primaryApi }) => {
    const res = await primaryApi.get('/api/v1/account/export');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toContain('attachment');
    const text = await res.text();
    const data = JSON.parse(text);
    expect(data.profile.email).toBeTruthy();
    expect(Array.isArray(data.personal_expenses)).toBe(true);
    expect(text).not.toContain('$2b$'); // no bcrypt hash
    expect(text).not.toMatch(/access_token|refresh_token|password_hash/);
  });

  test('"download my data" needs a login', async ({ request }) => {
    expect((await request.get('/api/v1/account/export')).status()).toBe(401);
  });

  test('the sign-in list includes this session and marks nothing it cannot know', async ({ primaryApi }) => {
    const res = await primaryApi.get('/api/v1/auth/sessions');
    expect(res.status()).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const s of items) expect(Object.keys(s).sort()).toEqual(['current', 'family_id', 'last_active_at', 'signed_in_at']);
  });

  test('deleting an account without proof of ownership is refused', async ({ secondaryApi }) => {
    // Never reaches deletion: no password / email confirmation is supplied.
    const res = await secondaryApi.delete('/api/v1/auth/profile');
    expect(res.status()).toBe(403);
    expect((await secondaryApi.get('/api/v1/auth/me')).status()).toBe(200);
  });
});
