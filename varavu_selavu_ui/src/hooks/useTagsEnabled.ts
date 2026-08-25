import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../api/config';

/** Whether the TAGS_ENABLED backend flag is on — same shared `GET /config` client-visible
 * flag surface as useCardCoachEnabled/useGroupsEnabled/useBudgetsEnabled. Defaults false
 * server-side until the retrieval surfaces (filter + bulk apply) actually ship (PRD §4.2). */
export function useTagsEnabled(): { enabled: boolean; isLoading: boolean } {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60_000,
  });

  return { enabled: !!data?.tags_enabled, isLoading };
}
