import API_BASE_URL from './apiconfig';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  user_id: string;
  query: string;
  year?: number;
  month?: number;
}

export async function sendChatMessage(
  token: string,
  userEmail: string,
  query: string,
  opts?: { year?: number; month?: number },
): Promise<string> {
  const body: ChatRequest = {
    user_id: userEmail,
    query,
    year: opts?.year,
    month: opts?.month,
  };

  // Backend endpoint is /api/v1/analysis/chat (not /chat/completions)
  const response = await fetch(`${API_BASE_URL}/api/v1/analysis/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Chat API error:', response.status, errorText);
    throw new Error('Failed to send message');
  }

  const data = await response.json();
  // Backend returns { response: string }
  return data.response || "No response";
}
