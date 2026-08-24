import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../api/config';

/** Whether the CARD_COACH_ENABLED backend flag is on — same shared `GET /config` client-visible
 * flag surface as useGroupsEnabled/useBudgetsEnabled. Defaults false server-side until the
 * curated card_catalog (TS-CARD-102) is populated and reviewed. */
export function useCardCoachEnabled(): { enabled: boolean; isLoading: boolean } {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60_000,
  });

  return { enabled: !!data?.card_coach_enabled, isLoading };
}
