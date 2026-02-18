import API_BASE_URL from './apiconfig';

export interface AnalysisResponse {
  top_categories: string[];
  category_totals: { category: string; total: number }[];
  monthly_trend: { month: string; total: number }[];
  total_expenses: number;
  category_expense_details?: Record<string, { date: string; description: string; category: string; cost: number }[]>;
  filter_info?: { applied_user_col?: string | null; year?: number | null; month?: number | null; row_count?: number };
}

export async function getAnalysis(token: string, userId: string, opts?: { year?: number; month?: number }): Promise<AnalysisResponse> {
  const params = new URLSearchParams();
  params.append('user_id', userId);
  if (opts?.year !== undefined) params.set('year', String(opts.year));
  if (opts?.month !== undefined) params.set('month', String(opts.month));
  // Cache busting
  params.set('_ts', String(Date.now()));

  const response = await fetch(`${API_BASE_URL}/api/v1/analysis?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch analysis data');
  }

  return response.json();
}
