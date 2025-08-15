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
