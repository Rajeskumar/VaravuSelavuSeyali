import { fetchWithAuth } from './api';

export type AnalysisScope = 'personal' | 'combined' | 'groups';

export interface SpendBreakdown {
  personal: number;
  group_share: number;
}

export interface AnalysisGroupSummary {
  group_id: string;
  name: string;
  my_share: number;
  i_paid: number;
  group_total: number;
  my_balance: number;
}

export interface AnalysisResponse {
  top_categories: string[];
  category_totals: { category: string; total: number }[];
  monthly_trend: { month: string; total: number }[];
  total_expenses: number;
  category_expense_details?: Record<string, { date: string; description: string; category: string; cost: number }[]>;
  filter_info?: {
    applied_user_col?: string | null;
    year?: number | null;
    month?: number | null;
    row_count?: number;
    scope?: string | null;
    group_id?: string | null;
  };
  // Optional — absent/null for scope=personal (matches backend TS-GRP-106; old-client responses stay valid).
  scope?: AnalysisScope;
  spend_breakdown?: SpendBreakdown | null;
  group_summaries?: AnalysisGroupSummary[] | null;
}

export async function getAnalysis(opts?: {
  year?: number;
  month?: number;
  scope?: AnalysisScope;
  group_id?: string;
}): Promise<AnalysisResponse> {
  const params = new URLSearchParams();
  if (opts?.year !== undefined) params.set('year', String(opts.year));
  if (opts?.month !== undefined) params.set('month', String(opts.month));
  if (opts?.scope !== undefined) params.set('scope', opts.scope);
  if (opts?.group_id !== undefined) params.set('group_id', opts.group_id);
  // Cache busting to ensure we always get fresh data when filters change
  params.set('_ts', String(Date.now()));
  const res = await fetchWithAuth(`/api/v1/analysis?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error('Failed to fetch analysis');
  return res.json();
}
