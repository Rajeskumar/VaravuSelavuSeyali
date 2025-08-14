import API_BASE_URL from './apiconfig';

export interface AnalysisResponse {
  top_categories: string[];
  category_totals: { category: string; total: number }[];
  monthly_trend: { month: string; total: number }[];
  total_expenses: number;
  category_expense_details?: Record<string, { date: string; description: string; category: string; cost: number }[]>;
  filter_info?: { applied_user_col?: string | null; year?: number | null; month?: number | null; row_count?: number };
}

export async function getAnalysis(user_id: string, opts?: { year?: number; month?: number }): Promise<AnalysisResponse> {
  const params = new URLSearchParams({ user_id });
  if (opts?.year !== undefined) params.set('year', String(opts.year));
  if (opts?.month !== undefined) params.set('month', String(opts.month));
  // Cache busting to ensure we always get fresh data when filters change
  params.set('_ts', String(Date.now()));
  const res = await fetch(`${API_BASE_URL}/api/v1/analysis?${params.toString()}`, {
    cache: 'no-store',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to fetch analysis');
  return res.json();
}
