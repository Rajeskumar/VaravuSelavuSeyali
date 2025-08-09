import API_BASE_URL from './apiconfig';

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
  const res = await fetch(`${API_BASE_URL}/add-expense`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to add expense');
  return res.json();
}
