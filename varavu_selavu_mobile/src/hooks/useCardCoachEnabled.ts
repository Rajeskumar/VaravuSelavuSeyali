import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../api/config';
import { useAuth } from '../context/AuthContext';

/** Whether the CARD_COACH_ENABLED backend flag is on — mirrors useBudgetsEnabled.ts, reading
 * the same shared `GET /config` client-visible flag surface as web's own useCardCoachEnabled.ts.
 * Defaults false server-side until the curated card_catalog (TS-CARD-102) is populated. */
export function useCardCoachEnabled(): { enabled: boolean; isLoading: boolean } {
  const { accessToken } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !!accessToken,
    retry: false,
    staleTime: 5 * 60_000,
  });

  return { enabled: !!data?.card_coach_enabled, isLoading };
}
