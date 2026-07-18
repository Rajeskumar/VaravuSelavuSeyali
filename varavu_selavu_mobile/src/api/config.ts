/**
 * config.ts — Mobile API client for the client-visible feature flag surface (TS-GRP-111).
 */
import { apiFetch } from './apiFetch';

export interface FeatureFlags {
  groups_enabled: boolean;
  entity_resolution_enabled: boolean;
}

/** Never requires auth and never 404s, unlike probing /groups directly. */
export async function getConfig(): Promise<FeatureFlags> {
  const res = await apiFetch('/api/v1/config');
  if (!res.ok) throw new Error('Failed to fetch config');
  return res.json();
}
