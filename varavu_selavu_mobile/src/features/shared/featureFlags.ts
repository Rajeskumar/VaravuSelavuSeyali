/**
 * featureFlags.ts — TrackSpense's client-visible feature flag surface (TS-GRP-111).
 */
import { fetchConfig } from '../../core/api/config';

export interface FeatureFlags {
  groups_enabled: boolean;
  entity_resolution_enabled: boolean;
  budgets_enabled: boolean;
  card_coach_enabled: boolean;
  tags_enabled: boolean;
  ai_enabled?: boolean;
  mcp_enabled?: boolean;
  mcp_management_url?: string;
}

export async function getConfig(): Promise<FeatureFlags> {
  return fetchConfig<FeatureFlags>();
}
