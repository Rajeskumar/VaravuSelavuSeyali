import { apiFetch } from './apiFetch';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatPayload {
  user_id: string;
  query: string;
  start_date?: string;
  end_date?: string;
  year?: number;
  month?: number;
  model?: string;
}

/**
 * Send a chat query to the backend AI analyst.
 * Endpoint: POST /api/v1/analysis/chat
 * Payload: { user_id, query, start_date?, end_date? }
 * Response: { response: string }
 */
export async function sendChatMessage(token: string, payload: ChatPayload): Promise<string> {
  const response = await apiFetch(`/api/v1/analysis/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error((errData as any).detail || 'Failed to send message');
  }

  const data = await response.json();
  return data.response || 'No response';
}
