import { fetchWithAuth } from './api';

/** TS-ENT-105 API surface — see
 * docs/features/smart_entity/TrackSpense_Smart_Entity_Resolution_Spec.md §10.
 * Gated behind ENTITY_RESOLUTION_ENABLED (see useEntityResolutionEnabled) —
 * every call here 404s until the backend flag is on. */

export interface EntitySuggestion {
  id: string;
  display_name: string;
  score: number;
  category_id?: string | null;
}

export interface SuggestResponse {
  suggestions: EntitySuggestion[];
}

export async function suggestMerchants(query: string, limit = 20): Promise<EntitySuggestion[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetchWithAuth(`/api/v1/suggest/merchants?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch merchant suggestions');
  const data: SuggestResponse = await res.json();
  return data.suggestions;
}

export async function suggestItems(query: string, merchantId?: string, limit = 20): Promise<EntitySuggestion[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (merchantId) params.set('merchant_id', merchantId);
  const res = await fetchWithAuth(`/api/v1/suggest/items?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch item suggestions');
  const data: SuggestResponse = await res.json();
  return data.suggestions;
}
