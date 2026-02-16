import API_BASE_URL from './apiconfig';

export interface ExpensePayload {
  user_id: string;
  description: string;
  category: string;
  sub_category?: string;
  date: string; // YYYY-MM-DD
  cost: number;
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

export async function addExpense(payload: ExpensePayload, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Add expense error:', response.status, errorText);
    throw new Error('Failed to add expense');
  }
}

export async function listExpenses(token: string, userEmail: string, offset = 0, limit = 30): Promise<ExpenseListResponse> {
  const params = new URLSearchParams({
    user_id: userEmail,
    offset: offset.toString(),
    limit: limit.toString(),
  });

  const response = await fetch(`${API_BASE_URL}/api/v1/expenses?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('List expenses error:', response.status, errorText);
    throw new Error('Failed to fetch expenses');
  }

  return response.json();
}

export async function deleteExpense(rowId: number, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/expenses/${rowId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete expense');
  }
}

export async function updateExpense(rowId: number, payload: ExpensePayload, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/expenses/${rowId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
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

  // Backend endpoint is /api/v1/ingest/receipt/parse (not /ocr/parse)
  const response = await fetch(`${API_BASE_URL}/api/v1/ingest/receipt/parse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to parse receipt');
  }

  return response.json();
}
