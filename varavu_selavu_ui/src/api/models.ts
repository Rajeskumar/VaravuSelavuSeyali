import { fetchWithAuth } from './api';

export interface ModelOption {
  provider: string;
  id: string;
  name: string;
}

export interface ModelsResponse {
  models: ModelOption[];
}

export async function getModels(signal?: AbortSignal): Promise<ModelsResponse> {
  const res = await fetchWithAuth(`/api/v1/models`, {
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error((err as any).detail || 'Failed to fetch models');
  }
  return res.json();
}
