/**
 * analytics.ts — Web app API client for Item & Merchant Insights.
 */
import { fetchWithAuth } from './api';

// ─── Types ──────────────────────────────────────────
export interface ItemInsightSummary {
  id: string;
  item_name: string;
  normalized_name?: string;
  avg_unit_price?: number;
  average_unit_price?: number;
  min_price?: number;
  min_unit_price?: number;
  max_price?: number;
  max_unit_price?: number;
  total_quantity_bought: number;
  total_spent: number;
  transaction_count: number;
  purchase_count?: number;
  distinct_merchants_count?: number;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  month_over_month_change_amount?: number | null;
  month_over_month_change_percent?: number | null;
  confidence?: string | null;
}

export interface PriceHistoryEntry {
  date: string;
  store_name: string | null;
  unit_price: number;
  quantity: number;
}

export interface StoreComparison {
  store_name: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  purchase_count: number;
}

export interface ItemInsightDetail extends ItemInsightSummary {
  price_history: PriceHistoryEntry[];
  store_comparison: StoreComparison[];
}

export interface MerchantInsightSummary {
  id: string;
  merchant_name: string;
  total_spent: number;
  transaction_count: number;
  average_transaction_amount?: number;
  month_over_month_change_amount?: number | null;
  month_over_month_change_percent?: number | null;
  confidence?: string | null;
}

export interface MonthlyAggregate {
  year: number;
  month: number;
  total_spent: number;
  transaction_count: number;
}

export interface MerchantItemBought {
  item_name: string;
  avg_price: number;
  purchase_count: number;
  total_quantity: number;
}

export interface RecentTransaction {
  date: string | null;
  description: string | null;
  amount: number;
}

export interface HighestTransaction {
  date: string | null;
  amount: number;
}

export interface MerchantInsightDetail extends MerchantInsightSummary {
  monthly_aggregates: MonthlyAggregate[];
  items_bought: MerchantItemBought[];
  recent_transactions?: RecentTransaction[];
  highest_transaction?: HighestTransaction | null;
  spend_share_percent?: number | null;
}

export interface ChangeInsight {
  metric_name: string;
  previous_value: number;
  current_value: number;
  change_amount: number;
  change_percent: number;
  time_scope: string;
  entity_name?: string;
}

interface DateFilters {
  year?: number;
  month?: number;
  start_date?: string;
  end_date?: string;
}

function appendDateFilters(params: URLSearchParams, filters: DateFilters) {
  // Precedence matches the backend: start/end date wins over year/month
  if (filters.start_date || filters.end_date) {
    if (filters.start_date) params.set('start_date', filters.start_date);
    if (filters.end_date) params.set('end_date', filters.end_date);
    return;
  }
  if (filters.year) params.set('year', String(filters.year));
  if (filters.month) params.set('month', String(filters.month));
}

// ─── API Calls ──────────────────────────────────────

export async function getTopItems(
  filters: DateFilters = {},
  limit = 20
): Promise<ItemInsightSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  appendDateFilters(params, filters);
  const res = await fetchWithAuth(`/api/v1/analytics/items?${params}`);
  if (!res.ok) throw new Error('Failed to fetch top items');
  return res.json();
}

export async function getItemDetail(
  itemName: string,
  filters: DateFilters = {}
): Promise<ItemInsightDetail> {
  const params = new URLSearchParams();
  appendDateFilters(params, filters);
  const qs = params.toString();
  const res = await fetchWithAuth(
    `/api/v1/analytics/items/${encodeURIComponent(itemName)}${qs ? `?${qs}` : ''}`
  );
  if (!res.ok) throw new Error('Failed to fetch item detail');
  return res.json();
}

export async function getTopMerchants(
  filters: DateFilters = {},
  limit = 20
): Promise<MerchantInsightSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  appendDateFilters(params, filters);
  const res = await fetchWithAuth(`/api/v1/analytics/merchants?${params}`);
  if (!res.ok) throw new Error('Failed to fetch top merchants');
  return res.json();
}

export async function getMerchantDetail(
  merchantName: string,
  filters: DateFilters = {}
): Promise<MerchantInsightDetail> {
  const params = new URLSearchParams();
  appendDateFilters(params, filters);
  const qs = params.toString();
  const res = await fetchWithAuth(
    `/api/v1/analytics/merchants/${encodeURIComponent(merchantName)}${qs ? `?${qs}` : ''}`
  );
  if (!res.ok) throw new Error('Failed to fetch merchant detail');
  return res.json();
}

export async function getChangeInsights(filters: DateFilters = {}): Promise<ChangeInsight[]> {
  const params = new URLSearchParams();
  appendDateFilters(params, filters);
  const res = await fetchWithAuth(`/api/v1/analytics/changes?${params}`);
  if (!res.ok) throw new Error('Failed to fetch change insights');
  return res.json();
}
