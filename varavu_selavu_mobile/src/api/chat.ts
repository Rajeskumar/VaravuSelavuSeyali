import API_BASE_URL from './apiconfig';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChatMessage(token: string, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  const data = await response.json();
  // Assuming standard OpenAI format or similar
  return data.choices?.[0]?.message?.content || "No response";
}
