import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getAiUsage, AiFeature, AiUsage } from '../api/aiUsage';
import { useAuth } from '../context/AuthContext';

export const AI_USAGE_QUERY_KEY = ['ai-usage'];

/** Today's AI allowance for the signed-in user — mirrors web's useAiUsage.ts. `refresh` should
 * be called after any AI call (success or refusal) so the remaining count stays accurate. */
export function useAiUsage(feature: AiFeature = 'chat') {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useQuery<AiUsage>({
    queryKey: AI_USAGE_QUERY_KEY,
    queryFn: getAiUsage,
    enabled: !!accessToken,
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
