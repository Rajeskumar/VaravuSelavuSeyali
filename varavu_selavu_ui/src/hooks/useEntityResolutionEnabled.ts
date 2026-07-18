import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../api/config';

/** Whether the ENTITY_RESOLUTION_ENABLED backend flag is on — same
 * enabled/isLoading contract as useGroupsEnabled, reading the same shared
 * `GET /config` client-visible flag surface. */
export function useEntityResolutionEnabled(): { enabled: boolean; isLoading: boolean } {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60_000,
  });

  return { enabled: !!data?.entity_resolution_enabled, isLoading };
}
