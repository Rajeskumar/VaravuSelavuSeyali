import { apiFetch } from './apiFetch';

export interface AnalysisResponse {
  top_categories: string[];
  category_totals: { category: string; total: number }[];
  monthly_trend: { month: string; total: number }[];
  total_expenses: number;
  category_expense_details?: Record<string, { date: string; description: string; category: string; cost: number }[]>;
  filter_info?: { applied_user_col?: string | null; year?: number | null; month?: number | null; row_count?: number };
}

export async function getAnalysis(
  token: string,
  userId: string,
  opts?: { year?: number; month?: number; start_date?: string; end_date?: string },
): Promise<AnalysisResponse> {
  const params = new URLSearchParams();
  params.append('user_id', userId);
  if (opts?.year !== undefined) params.set('year', String(opts.year));
  if (opts?.month !== undefined) params.set('month', String(opts.month));
  if (opts?.start_date) params.set('start_date', opts.start_date);
  if (opts?.end_date) params.set('end_date', opts.end_date);
  // Cache busting
  params.set('_ts', String(Date.now()));

  const response = await apiFetch(`/api/v1/analysis?${params.toString()}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch analysis data');
  }

  return response.json();
}
