import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../api/config';
import { useAuth } from '../context/AuthContext';

/** Whether the BUDGETS_ENABLED backend flag is on — mirrors useEntityResolutionEnabled.ts,
 * reading the same shared `GET /config` client-visible flag surface as web's own
 * useBudgetsEnabled.ts. Defaults true server-side; still checked here so an operator can
 * kill-switch it without a client release. */
export function useBudgetsEnabled(): { enabled: boolean; isLoading: boolean } {
  const { accessToken } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !!accessToken,
    retry: false,
    staleTime: 5 * 60_000,
  });

  return { enabled: !!data?.budgets_enabled, isLoading };
}
