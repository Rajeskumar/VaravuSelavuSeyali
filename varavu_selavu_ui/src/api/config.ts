import { fetchWithAuth } from './api';

export interface FeatureFlags {
  groups_enabled: boolean;
  entity_resolution_enabled: boolean;
}

/** Client-visible feature flag surface (TS-GRP-111) — never requires auth and
 * never 404s, unlike probing /groups directly. */
export async function getConfig(): Promise<FeatureFlags> {
  const res = await fetchWithAuth('/api/v1/config');
  if (!res.ok) throw new Error('Failed to fetch config');
  return res.json();
}
