import { fetchWithAuth } from './api';
import { TagRefDTO } from './tags';
import { CardRefDTO } from './cards';

export interface AddExpensePayload {
  user_id: string;
  date: string; // MM/DD/YYYY
  description: string;
  category: string; // subcategory string
  cost: number;
  merchant_name?: string;
  // TS-TAG-104 — on PUT, omitted leaves tags unchanged; an explicit [] clears them.
  tag_names?: string[];
  // TS-CARD-114 — always-replace, same semantics as merchant_name (unlike tag_names, there's
  // no separate additive write path for this single value, so no omitted/empty distinction).
  card_id?: string | null;
}

export interface AddExpenseResponse {
  success: boolean;
  expense: Record<string, unknown>;
}

export async function addExpense(payload: AddExpensePayload): Promise<AddExpenseResponse> {
  const res = await fetchWithAuth(`/api/v1/expenses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to add expense');
  return res.json();
}

export interface ExpenseRecord {
  row_id: number;
  user_id: string;
  date: string;
  description: string;
  category: string;
  cost: number;
  merchant_name?: string;
  item_count?: number;
  split_type?: string | null;
  tags?: TagRefDTO[];
  card?: CardRefDTO | null;
}

export interface ExpenseListResponse {
  items: ExpenseRecord[];
  next_offset?: number;
}

export async function listExpenses(
  offset = 0,
  limit = 30,
  tagIds?: string[],
): Promise<ExpenseListResponse> {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString(),
  });
  (tagIds || []).forEach((id) => params.append('tag_ids', id));
  const res = await fetchWithAuth(`/api/v1/expenses?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch expenses');
  return res.json();
}

export async function updateExpense(row_id: number, payload: AddExpensePayload): Promise<AddExpenseResponse> {
  const res = await fetchWithAuth(`/api/v1/expenses/${row_id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update expense');
  return res.json();
}

export async function deleteExpense(row_id: number): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/expenses/${row_id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete expense');
}

export interface ReceiptParseDraft {
  header: Record<string, any>;
  items: Record<string, any>[];
  warnings: string[];
  fingerprint: string;
  ocr_text?: string;
}

export async function parseReceipt(file: File): Promise<ReceiptParseDraft> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchWithAuth(`/api/v1/ingest/receipt/parse`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Failed to parse receipt');
  return res.json();
}

export async function addExpenseWithItems(payload: any) {
  const res = await fetchWithAuth(`/api/v1/expenses/with_items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save expense');
  return res.json();
}

export interface ExpenseItemDTO {
  id: string;
  line_no: number;
  item_name: string;
  normalized_name?: string | null;
  category_id?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total: number;
  tax?: number | null;
  discount?: number | null;
}

export interface ItemsResponse {
  items: ExpenseItemDTO[];
  amount: number;
  tax: number;
  discount: number;
}

export interface ItemsUpdatePayload {
  items: {
    line_no: number;
    item_name: string;
    normalized_name?: string | null;
    category_id?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    line_total: number;
  }[];
  amount: number;
  tax?: number;
  discount?: number;
}

export async function getExpenseItems(rowId: number | string): Promise<ItemsResponse> {
  const res = await fetchWithAuth(`/api/v1/expenses/${rowId}/items`);
  if (!res.ok) throw new Error('Failed to fetch expense items');
  return res.json();
}

export async function updateExpenseItems(rowId: number | string, payload: ItemsUpdatePayload): Promise<ItemsResponse> {
  const res = await fetchWithAuth(`/api/v1/expenses/${rowId}/items`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update expense items');
  return res.json();
}

export interface CategorySuggestion {
  main_category: string;
  subcategory: string;
  merchant_name?: string;
}

export async function suggestCategory(description: string): Promise<CategorySuggestion> {
  const res = await fetchWithAuth(`/api/v1/expenses/categorize`, {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error('Failed to classify expense');
  return res.json();
}

// ---------------------------------------------------------------------------
// Personal-ledger CSV export (P2-5)
// ---------------------------------------------------------------------------

/** Downloads the caller's personal expenses as CSV. Bounds are MM/DD/YYYY. */
export async function exportMyExpensesCsv(startDate?: string, endDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const query = params.toString();

  const res = await fetchWithAuth(`/api/v1/expenses/export.csv${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error('Failed to export expenses');

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'trackspense_expenses.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
