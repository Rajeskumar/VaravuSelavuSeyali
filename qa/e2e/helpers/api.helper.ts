import { APIRequestContext, APIResponse, request as pwRequest } from '@playwright/test';
import { env, assertWritesAllowed } from './env';
import { qaLabel, uniqueSuffix } from './test-data.helper';

/**
 * Thin wrapper around a logged-in Playwright APIRequestContext.
 *
 * The real backend issues auth as HttpOnly cookies (`vs_token`/`vs_refresh`) plus a
 * non-HttpOnly double-submit CSRF cookie (`vs_csrf`) that must be echoed back as the
 * `X-CSRF-Token` header on every unsafe method. Playwright's request context already
 * manages the cookie jar for us across calls in the same context — this class only
 * adds the CSRF echo and a couple of domain-shaped convenience methods.
 */
export class AuthedApi {
  private constructor(
    public readonly ctx: APIRequestContext,
    public readonly apiBaseUrl: string,
  ) {}

  static async login(email: string, password: string, apiBaseUrl = env.API_BASE_URL): Promise<AuthedApi> {
    const ctx = await pwRequest.newContext({ baseURL: apiBaseUrl });
    const res = await ctx.post('/api/v1/auth/login', {
      form: { username: email, password },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`Login failed for ${email}: ${res.status()} ${body}`);
    }
    return new AuthedApi(ctx, apiBaseUrl);
  }

  static async fromStorageState(storageStatePath: string, apiBaseUrl = env.API_BASE_URL): Promise<AuthedApi> {
    const ctx = await pwRequest.newContext({ baseURL: apiBaseUrl, storageState: storageStatePath });
    return new AuthedApi(ctx, apiBaseUrl);
  }

  private async csrfToken(): Promise<string> {
    const state = await this.ctx.storageState();
    const cookie = state.cookies.find((c) => c.name === 'vs_csrf');
    if (!cookie) throw new Error('No vs_csrf cookie on this context — did login() succeed?');
    return cookie.value;
  }

  private async unsafeHeaders(): Promise<Record<string, string>> {
    return { 'X-CSRF-Token': await this.csrfToken() };
  }

  async get(path: string, opts: Parameters<APIRequestContext['get']>[1] = {}): Promise<APIResponse> {
    return this.ctx.get(path, opts);
  }

  async post(path: string, opts: Parameters<APIRequestContext['post']>[1] = {}): Promise<APIResponse> {
    assertWritesAllowed(this.apiBaseUrl);
    const headers = { ...(await this.unsafeHeaders()), ...(opts.headers || {}) };
    return this.ctx.post(path, { ...opts, headers });
  }

  async put(path: string, opts: Parameters<APIRequestContext['put']>[1] = {}): Promise<APIResponse> {
    assertWritesAllowed(this.apiBaseUrl);
    const headers = { ...(await this.unsafeHeaders()), ...(opts.headers || {}) };
    return this.ctx.put(path, { ...opts, headers });
  }

  async patch(path: string, opts: Parameters<APIRequestContext['patch']>[1] = {}): Promise<APIResponse> {
    assertWritesAllowed(this.apiBaseUrl);
    const headers = { ...(await this.unsafeHeaders()), ...(opts.headers || {}) };
    return this.ctx.patch(path, { ...opts, headers });
  }

  async delete(path: string, opts: Parameters<APIRequestContext['delete']>[1] = {}): Promise<APIResponse> {
    assertWritesAllowed(this.apiBaseUrl);
    const headers = { ...(await this.unsafeHeaders()), ...(opts.headers || {}) };
    return this.ctx.delete(path, { ...opts, headers });
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  // ---- Domain helpers -----------------------------------------------------

  /** date must already be MM/DD/YYYY — the backend rejects anything else on this endpoint. */
  async createExpense(overrides: Partial<{
    cost: number; category: string; description: string; date: string;
    merchant_name: string; notes: string;
  }> = {}): Promise<{ description: string; row_id: string }> {
    const description = overrides.description ?? qaLabel(`expense_${uniqueSuffix()}`);
    const payload = {
      user_id: 'qa', // ignored server-side; auth_required's identity always wins
      cost: overrides.cost ?? 12.34,
      category: overrides.category ?? 'Food & Dining',
      description,
      date: overrides.date ?? todayMDY(),
      merchant_name: overrides.merchant_name,
      notes: overrides.notes,
    };
    const res = await this.post('/api/v1/expenses', { data: payload });
    if (!res.ok()) throw new Error(`createExpense failed: ${res.status()} ${await res.text()}`);
    // The create response never echoes the new row's id (see models.Expense) — the only
    // way to learn it is to look it back up by its (unique, QA-tagged) description.
    const row_id = await this.findExpenseRowIdByDescription(description);
    return { description, row_id };
  }

  async findExpenseRowIdByDescription(description: string): Promise<string> {
    const res = await this.get('/api/v1/expenses', { params: { limit: '200', offset: '0' } });
    if (!res.ok()) throw new Error(`listExpenses failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    const match = (body.items || []).find((e: any) => e.description === description);
    if (!match) throw new Error(`Could not find just-created expense "${description}" in the list`);
    return match.row_id;
  }

  async updateExpense(rowId: string, data: Record<string, unknown>): Promise<APIResponse> {
    return this.put(`/api/v1/expenses/${rowId}`, { data });
  }

  async deleteExpense(rowId: string): Promise<APIResponse> {
    return this.delete(`/api/v1/expenses/${rowId}`);
  }

  async listExpenses(params: Record<string, string> = {}): Promise<any> {
    const res = await this.get('/api/v1/expenses', { params: { limit: '200', offset: '0', ...params } });
    if (!res.ok()) throw new Error(`listExpenses failed: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  async getAnalysis(params: Record<string, string> = {}): Promise<any> {
    const res = await this.get('/api/v1/analysis', { params: { scope: 'personal', ...params } });
    if (!res.ok()) throw new Error(`getAnalysis failed: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  async createGroup(overrides: Partial<{ name: string; group_type: string; currency: string }> = {}): Promise<any> {
    const payload = {
      name: overrides.name ?? qaLabel(`group_${uniqueSuffix()}`),
      group_type: overrides.group_type ?? 'other',
      currency: overrides.currency ?? 'USD',
    };
    const res = await this.post('/api/v1/groups', { data: payload });
    if (!res.ok()) throw new Error(`createGroup failed: ${res.status()} ${await res.text()}`);
    return res.json(); // GroupSummary: { group_id, name, ... }
  }

  async addMemberByEmail(groupId: string, email: string): Promise<any> {
    const res = await this.post(`/api/v1/groups/${groupId}/members`, { data: { email } });
    if (!res.ok()) throw new Error(`addMemberByEmail failed: ${res.status()} ${await res.text()}`);
    return res.json(); // MemberDTO
  }

  async listGroupMembers(groupId: string): Promise<any[]> {
    const res = await this.get(`/api/v1/groups/${groupId}`);
    if (!res.ok()) throw new Error(`getGroup failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return body.members || [];
  }

  async createGroupExpense(groupId: string, overrides: {
    amount: number; payers: { member_id: string; amount_paid: number }[];
    split: { type: string; entries: { member_id: string; value?: number }[] };
    description?: string; category?: string; date?: string;
  }): Promise<any> {
    const payload = {
      date: overrides.date ?? todayMDY(),
      description: overrides.description ?? qaLabel(`group_expense_${uniqueSuffix()}`),
      category: overrides.category ?? 'Food & Dining',
      amount: overrides.amount,
      payers: overrides.payers,
      split: overrides.split,
    };
    const res = await this.post(`/api/v1/groups/${groupId}/expenses`, { data: payload });
    if (!res.ok()) throw new Error(`createGroupExpense failed: ${res.status()} ${await res.text()}`);
    return res.json(); // GroupExpenseCreatedResponse
  }

  async getGroupBalances(groupId: string): Promise<any> {
    const res = await this.get(`/api/v1/groups/${groupId}/balances`);
    if (!res.ok()) throw new Error(`getGroupBalances failed: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  async createBudget(overrides: {
    target_type: 'overall' | 'category'; amount: number; category?: string; scope?: 'personal' | 'combined';
  }): Promise<any> {
    const payload = {
      scope: overrides.scope ?? 'personal',
      target_type: overrides.target_type,
      category: overrides.category,
      amount: overrides.amount,
      currency: 'USD',
      rollover: false,
    };
    const res = await this.post('/api/v1/budgets', { data: payload });
    if (!res.ok()) throw new Error(`createBudget failed: ${res.status()} ${await res.text()}`);
    return res.json(); // BudgetDTO
  }

  async getBudgetBreakdown(budgetId: string): Promise<any> {
    const res = await this.get(`/api/v1/budgets/${budgetId}/breakdown`);
    if (!res.ok()) throw new Error(`getBudgetBreakdown failed: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  async me(): Promise<any> {
    const res = await this.get('/api/v1/auth/me');
    if (!res.ok()) throw new Error(`/auth/me failed: ${res.status()} ${await res.text()}`);
    return res.json();
  }
}

// ---- Unauthenticated / standalone helpers ----------------------------------

export async function healthz(apiBaseUrl = env.API_BASE_URL): Promise<boolean> {
  try {
    const ctx = await pwRequest.newContext({ baseURL: apiBaseUrl, timeout: 5000 });
    const res = await ctx.get('/api/v1/healthz');
    await ctx.dispose();
    return res.ok();
  } catch {
    return false;
  }
}

export async function getPublicConfig(apiBaseUrl = env.API_BASE_URL): Promise<Record<string, boolean>> {
  const ctx = await pwRequest.newContext({ baseURL: apiBaseUrl });
  const res = await ctx.get('/api/v1/config');
  const body = await res.json();
  await ctx.dispose();
  return body;
}

/**
 * Registers a user if it doesn't already exist. The backend returns a generic 400 on a
 * duplicate email (deliberate anti-enumeration), so a 400 here is treated as "already
 * provisioned, fine" rather than a hard failure — makes this safe to call every run even
 * against a QA database that already has last run's users in it.
 */
export async function ensureUserRegistered(
  name: string,
  email: string,
  password: string,
  apiBaseUrl = env.API_BASE_URL,
): Promise<void> {
  assertWritesAllowed(apiBaseUrl);
  const ctx = await pwRequest.newContext({ baseURL: apiBaseUrl });
  const res = await ctx.post('/api/v1/auth/register', { data: { name, email, password } });
  const ok = res.ok() || res.status() === 400;
  const body = ok ? '' : await res.text(); // must read before dispose() — a disposed context's response body is gone
  await ctx.dispose();
  if (!ok) {
    throw new Error(`ensureUserRegistered(${email}) failed: ${res.status()} ${body}`);
  }
}

export function todayMDY(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}
