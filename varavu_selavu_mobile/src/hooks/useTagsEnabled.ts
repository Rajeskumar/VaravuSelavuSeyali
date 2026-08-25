import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../api/config';
import { useAuth } from '../context/AuthContext';

/** Whether the TAGS_ENABLED backend flag is on — mirrors useBudgetsEnabled.ts, reading the
 * same shared `GET /config` client-visible flag surface as web's own useTagsEnabled.ts. */
export function useTagsEnabled(): { enabled: boolean; isLoading: boolean } {
  const { accessToken } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !!accessToken,
    retry: false,
    staleTime: 5 * 60_000,
  });

  return { enabled: !!data?.tags_enabled, isLoading };
}
