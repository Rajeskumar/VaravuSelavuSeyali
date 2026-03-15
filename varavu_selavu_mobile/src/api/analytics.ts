/**
 * analytics.ts — API client for Item & Merchant Insights endpoints.
 */
import { apiFetch } from './apiFetch';

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

export interface MerchantInsightDetail extends MerchantInsightSummary {
  monthly_aggregates: MonthlyAggregate[];
  items_bought: MerchantItemBought[];
}

export interface ChangeInsight {
  metric_name: string;
  previous_value: number;
  current_value: number;
  change_amount: number;
  change_percent: number;
  time_scope: string;
}

interface DateFilters {
  year?: number;
  month?: number;
}

// ─── API Calls ──────────────────────────────────────

export async function getTopItems(
  userId: string,
  filters: DateFilters = {},
  limit = 20
): Promise<ItemInsightSummary[]> {
  const params = new URLSearchParams({ user_id: userId, limit: String(limit) });
  if (filters.year) params.set('year', String(filters.year));
  if (filters.month) params.set('month', String(filters.month));
  const res = await apiFetch(`/api/v1/analytics/items?${params}`);
  if (!res.ok) throw new Error('Failed to fetch top items');
  return res.json();
}

export async function getItemDetail(userId: string, itemName: string): Promise<ItemInsightDetail> {
  const params = new URLSearchParams({ user_id: userId });
  const res = await apiFetch(`/api/v1/analytics/items/${encodeURIComponent(itemName)}?${params}`);
  if (!res.ok) throw new Error('Failed to fetch item detail');
  return res.json();
}

export async function getTopMerchants(
  userId: string,
  filters: DateFilters = {},
  limit = 20
): Promise<MerchantInsightSummary[]> {
  const params = new URLSearchParams({ user_id: userId, limit: String(limit) });
  if (filters.year) params.set('year', String(filters.year));
  if (filters.month) params.set('month', String(filters.month));
  const res = await apiFetch(`/api/v1/analytics/merchants?${params}`);
  if (!res.ok) throw new Error('Failed to fetch top merchants');
  return res.json();
}

export async function getMerchantDetail(userId: string, merchantName: string): Promise<MerchantInsightDetail> {
  const params = new URLSearchParams({ user_id: userId });
  const res = await apiFetch(`/api/v1/analytics/merchants/${encodeURIComponent(merchantName)}?${params}`);
  if (!res.ok) throw new Error('Failed to fetch merchant detail');
  return res.json();
}

export async function getChangeInsights(userId: string, filters: DateFilters = {}): Promise<ChangeInsight[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (filters.year) params.set('year', String(filters.year));
  if (filters.month) params.set('month', String(filters.month));
  const res = await apiFetch(`/api/v1/analytics/changes?${params}`);
  if (!res.ok) throw new Error('Failed to fetch change insights');
  return res.json();
}
