import { useQuery } from '@tanstack/react-query';
import { listGroups, ApiError } from '../api/groups';

/** Whether the GROUPS_ENABLED backend flag is on, detected via the same 404 the
 * backend returns for every /groups route when the flag is off (TS-GRP-102).
 * There is no dedicated client-facing flag surface yet (that's TS-GRP-111's
 * job) — this is the pragmatic fallback used across all group-aware surfaces
 * so widgets/filters/toggles stay hidden until confirmed enabled, instead of
 * flashing and then disappearing. Shares the `['groups']` query key with
 * GroupsPage so the check doesn't duplicate a network call when both are
 * mounted within the cache's staleTime. */
export function useGroupsEnabled(): { enabled: boolean; isLoading: boolean } {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const { data, error, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (error instanceof ApiError && error.status === 404) {
    return { enabled: false, isLoading: false };
  }
  return { enabled: data !== undefined, isLoading };
}
