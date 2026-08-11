import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../api/config';

/** Whether the BUDGETS_ENABLED backend flag is on — same shared `GET /config` client-visible
 * flag surface as useGroupsEnabled/useEntityResolutionEnabled. Defaults true server-side, but
 * still checked here for consistency with every other feature surface (and so an operator can
 * kill-switch it without a client release). */
export function useBudgetsEnabled(): { enabled: boolean; isLoading: boolean } {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60_000,
  });

  return { enabled: !!data?.budgets_enabled, isLoading };
}
