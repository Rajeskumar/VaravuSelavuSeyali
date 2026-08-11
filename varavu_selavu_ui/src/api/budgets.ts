import { fetchWithAuth } from './api';

export type BudgetScope = 'personal' | 'combined';
export type BudgetTargetType = 'overall' | 'category';
export type BudgetStatus = 'on_track' | 'at_risk' | 'over_pace' | 'exceeded';

export interface BudgetDTO {
  id: string;
  scope: BudgetScope;
  target_type: BudgetTargetType;
  category: string | null;
  amount: number;
  currency: string;
  period_type: string;
  rollover: boolean;
  alert_thresholds: number[];
  muted: boolean;
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  spent: number;
  committed: number;
  remaining: number;
  projected: number;
  status: BudgetStatus;
  is_snapshot: boolean;
}

export interface CreateBudgetPayload {
  scope?: BudgetScope;
  target_type: BudgetTargetType;
  category?: string | null;
  amount: number;
  currency?: string;
  rollover?: boolean;
  alert_thresholds?: number[];
}

export interface UpdateBudgetPayload {
  amount?: number;
  rollover?: boolean;
  alert_thresholds?: number[];
  muted?: boolean;
}

export interface BudgetTransactionRow {
  date: string;
  description: string;
  category: string;
  cost: number;
  kind?: 'personal' | 'group' | null;
  group_name?: string | null;
}

export interface BudgetBreakdown {
  budget: BudgetDTO;
  transactions: BudgetTransactionRow[];
}

export interface BudgetSuggestion {
  category: string;
  suggested_amount: number;
  based_on_months: number;
}

export async function listBudgets(params?: { scope?: BudgetScope; period?: string }): Promise<BudgetDTO[]> {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set('scope', params.scope);
  if (params?.period) qs.set('period', params.period);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetchWithAuth(`/api/v1/budgets${suffix}`, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load budgets');
  return res.json();
}

export async function createBudget(payload: CreateBudgetPayload): Promise<BudgetDTO> {
  const res = await fetchWithAuth('/api/v1/budgets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save budget');
  return res.json();
}

export async function updateBudget(id: string, payload: UpdateBudgetPayload): Promise<BudgetDTO> {
  const res = await fetchWithAuth(`/api/v1/budgets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update budget');
  return res.json();
}

export async function deleteBudget(id: string): Promise<{ success: boolean }> {
  const res = await fetchWithAuth(`/api/v1/budgets/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete budget');
  return res.json();
}

export async function getBudgetBreakdown(id: string, period?: string): Promise<BudgetBreakdown> {
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  const res = await fetchWithAuth(`/api/v1/budgets/${id}/breakdown${qs}`, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load budget breakdown');
  return res.json();
}

export async function getBudgetSuggestions(scope: BudgetScope = 'personal'): Promise<BudgetSuggestion[]> {
  const res = await fetchWithAuth(`/api/v1/budgets/suggestions?scope=${scope}`, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load budget suggestions');
  return res.json();
}

export async function getBudgetAskWhy(id: string, period?: string): Promise<{ response: string }> {
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  const res = await fetchWithAuth(`/api/v1/budgets/${id}/ask-why${qs}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to get an explanation for this budget');
  return res.json();
}
