import API_BASE_URL from './apiconfig';

export interface ModelsResponse {
  provider: 'openai' | 'ollama' | string;
  models: string[];
}

export async function getModels(signal?: AbortSignal): Promise<ModelsResponse> {
  const token = localStorage.getItem('vs_token');
  const res = await fetch(`${API_BASE_URL}/api/v1/models`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error((err as any).detail || 'Failed to fetch models');
  }
  return res.json();
}
