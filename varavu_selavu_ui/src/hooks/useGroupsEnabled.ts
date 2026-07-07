import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../api/config';

/** Whether the GROUPS_ENABLED backend flag is on, read from the dedicated
 * client-visible flag surface (TS-GRP-111's `GET /config`). Replaces the
 * earlier 404-probe-against-/groups fallback (TS-GRP-102/108) — same
 * enabled/isLoading contract, so every group-aware surface (DashboardPage,
 * ExpensesPage, ExpenseAnalysisPage, AddExpenseForm, GroupsPage) keeps working
 * unchanged. */
export function useGroupsEnabled(): { enabled: boolean; isLoading: boolean } {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60_000,
  });

  return { enabled: !!data?.groups_enabled, isLoading };
}
