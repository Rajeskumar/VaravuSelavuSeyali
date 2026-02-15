// src/api/expenses.ts
import API_BASE_URL from './apiconfig';

export interface ExpensePayload {
  description: string;
  category: string;
  sub_category?: string;
  date: string; // YYYY-MM-DD
  cost: number;
}

export async function addExpense(payload: ExpensePayload, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/expenses/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to add expense');
  }
}

export async function uploadReceipt(uri: string, token: string): Promise<any> {
    const formData = new FormData();
    // React Native's FormData requires a special object for files
    const file = {
      uri,
      name: 'receipt.jpg',
      type: 'image/jpeg',
    } as any;

    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/v1/ocr/parse`, {
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
