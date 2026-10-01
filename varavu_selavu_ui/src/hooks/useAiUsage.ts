import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getAiUsage, AiFeature, AiUsage } from '../api/aiUsage';

export const AI_USAGE_QUERY_KEY = ['ai-usage'];

/** Today's AI allowance for the signed-in user. `refresh` should be called after any AI call
 * (success or refusal) so the remaining count stays accurate. */
export function useAiUsage(feature: AiFeature = 'chat') {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const queryClient = useQueryClient();
  const { data } = useQuery<AiUsage>({
    queryKey: AI_USAGE_QUERY_KEY,
    queryFn: getAiUsage,
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  });
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: AI_USAGE_QUERY_KEY }),
    [queryClient],
  );

  const f = data?.features?.[feature];
  const exhausted = !!f && f.remaining !== null && f.remaining <= 0;
  const unavailable = !!data && (!data.ai_enabled || data.paused || data.blocked ||
    (data.requires_verified_email && !data.email_verified));
  return { usage: data, feature: f, exhausted, unavailable, refresh };
}
