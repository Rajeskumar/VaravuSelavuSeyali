import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '../api/auth';

/** Whether the signed-in user's email is verified (null while unknown). Groups require it
 * server-side, so screens use this to explain the requirement before the user hits it. */
export function useEmailVerified() {
  const query = useQuery({
    queryKey: ['auth-me'],
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  });
  return { verified: query.data ? query.data.email_verified ?? null : null, refetch: query.refetch };
}
