import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../api/config';
import { useAuth } from '../context/AuthContext';

/** Whether the ENTITY_RESOLUTION_ENABLED backend flag is on — mirrors the web
 * app's useEntityResolutionEnabled.ts, reading the same shared `GET /config`
 * client-visible flag surface. Replaces the per-screen ad-hoc flag checks
 * (e.g. AddExpenseScreen's inline `checkGroupsEnabled`/groupsData pattern)
 * with one shared hook, per the entity-resolution frontend plan's explicit
 * call for a "real shared hook" here rather than repeating that pattern. */
export function useEntityResolutionEnabled(): { enabled: boolean; isLoading: boolean } {
  const { accessToken } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !!accessToken,
    retry: false,
    staleTime: 5 * 60_000,
  });

  return { enabled: !!data?.entity_resolution_enabled, isLoading };
}
