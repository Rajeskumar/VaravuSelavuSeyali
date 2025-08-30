import { fetchWithAuth } from './api';

export interface AddExpensePayload {
  user_id: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string; // subcategory string
  cost: number;
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
}

export interface ExpenseListResponse {
  items: ExpenseRecord[];
  next_offset?: number;
}

export async function listExpenses(
  user_id: string,
  offset = 0,
  limit = 30
): Promise<ExpenseListResponse> {
  const params = new URLSearchParams({
    user_id,
    offset: offset.toString(),
    limit: limit.toString(),
  });
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

export interface CategorySuggestion {
  main_category: string;
  subcategory: string;
}

export async function suggestCategory(description: string): Promise<CategorySuggestion> {
  const res = await fetchWithAuth(`/api/v1/expenses/categorize`, {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error('Failed to classify expense');
  return res.json();
}
