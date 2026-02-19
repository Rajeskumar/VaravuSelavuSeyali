import { apiFetch } from './apiFetch';
import API_BASE_URL from './apiconfig';

export interface ExpensePayload {
  description: string;
  category: string;
  sub_category?: string;
  date: string; // MM/DD/YYYY
  cost: number;
  user_id?: string;
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

export interface CategorizeResult {
  main_category: string;
  subcategory: string;
}

export async function addExpense(payload: ExpensePayload, token: string): Promise<void> {
  const response = await apiFetch(`/api/v1/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to add expense');
  }
}

export async function listExpenses(token: string, userId: string, offset = 0, limit = 30): Promise<ExpenseListResponse> {
  const params = new URLSearchParams({
    user_id: userId,
    offset: offset.toString(),
    limit: limit.toString(),
  });

  const response = await apiFetch(`/api/v1/expenses?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch expenses');
  }

  return response.json();
}

export async function deleteExpense(rowId: number, token: string): Promise<void> {
  const response = await apiFetch(`/api/v1/expenses/${rowId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete expense');
  }
}

export async function updateExpense(rowId: number, payload: ExpensePayload, token: string): Promise<void> {
  const response = await apiFetch(`/api/v1/expenses/${rowId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to update expense');
  }
}

export async function uploadReceipt(uri: string, token: string): Promise<any> {
  const formData = new FormData();
  const file = {
    uri,
    name: 'receipt.jpg',
    type: 'image/jpeg',
  } as any;

  formData.append('file', file);

  // Do NOT set Content-Type manually — React Native sets it with the boundary
  const response = await apiFetch(`/api/v1/ingest/receipt/parse`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to parse receipt');
  }

  return response.json();
}

/**
 * Call the backend categorization endpoint.
 * Returns suggested main_category and subcategory for a description.
 */
export async function categorizeExpense(description: string): Promise<CategorizeResult> {
  const response = await apiFetch(`/api/v1/expenses/categorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });

  if (!response.ok) {
    throw new Error('Failed to categorize');
  }

  return response.json();
}

/**
 * Save an expense with itemized line items (receipt flow).
 * Backend: POST /api/v1/expenses/with_items
 */
export async function addExpenseWithItems(payload: {
  user_email: string;
  header: Record<string, any>;
  items: Record<string, any>[];
}): Promise<{ expense_id: string; item_ids: string[] }> {
  const response = await apiFetch(`/api/v1/expenses/with_items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error((errData as any).detail || 'Failed to save expense with items');
  }

  return response.json();
}
