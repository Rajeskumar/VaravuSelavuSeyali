import React from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import useMediaQuery from '@mui/material/useMediaQuery';
import { motion } from 'framer-motion';
import { useTheme } from '@mui/material/styles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import TrueTotalHero, { MomDelta, SpendLens } from '../components/dashboard/TrueTotalHero';
import SpendSpectrum from '../components/dashboard/SpendSpectrum';
import MyGroupsStrip from '../components/dashboard/MyGroupsStrip';
import InsightOfTheDay, { Insight } from '../components/dashboard/InsightOfTheDay';
import TypeToLogBar from '../components/dashboard/TypeToLogBar';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { getChangeInsights, ChangeInsight } from '../api/analytics';
import { parseAppDate } from '../utils/date';
import { dayLabel } from '../components/expenses/ExpenseFeed';
import { listExpenses } from '../api/expenses';
import { listAllMyGroupExpenses, listGroups, UnifiedGroupExpenseRow, GroupSummary } from '../api/groups';
import { useGroupsEnabled } from '../hooks/useGroupsEnabled';
import { onExpenseChanged } from '../utils/expenseEvents';
import { slate, tabularNums } from '../theme';

const COMBINED_TOAST_KEY = 'vs_combined_toast_shown_v1';
const RECENT_FEED_LIMIT = 6;

function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

interface RecentItem {
  date: string;
  description: string;
  category: string;
  cost: number;
}

/**
 * TS-DES-203 — picks the single insight to show, in priority order:
 * 1. The top-ranked backend `ChangeInsight` (TS-ANL-004's 7 types — category spikes, new
 *    merchants, unusual transactions, etc. — already relevance-ranked server-side).
 * 2. A locally-computed pace projection ("on pace for $X this month"), when there's enough
 *    signal (a MoM delta exists) to say something meaningful about the projection.
 * 3. The single biggest expense so far this month, from the already-fetched recent feed.
 * Returns null (renders nothing) if none of the three have anything to say — a brand-new
 * user's first few days, for instance.
 */
function pickInsight(
  changeInsights: ChangeInsight[],
  personalTotal: number,
  momDelta: MomDelta | null,
  now: Date,
  recent: RecentItem[]
): Insight | null {
  if (changeInsights.length > 0) {
    const top = changeInsights[0];
    const isNew = top.change_percent === 100;
    const isIncrease = top.change_amount > 0;
    const headline = isNew
      ? `New this month: ${top.metric_name}`
      : `${top.metric_name} ${isIncrease ? 'is up' : 'is down'} ${Math.abs(top.change_percent).toFixed(0)}% vs last period`;
    const detail = isNew
      ? `${formatMoney(top.current_value)} so far — nothing recorded for this in the comparison period.`
      : `${formatMoney(top.previous_value)} → ${formatMoney(top.current_value)} (${top.change_amount > 0 ? '+' : ''}${formatMoney(top.change_amount)}).`;
    return { headline, detail };
  }

  if (momDelta) {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    if (dayOfMonth >= 3 && personalTotal > 0) {
      const projected = personalTotal / (dayOfMonth / daysInMonth);
      return {
        headline: `On pace for ${formatMoney(projected)} this month`,
        detail: `${dayOfMonth} of ${daysInMonth} days elapsed, ${momDelta.percent > 0 ? '+' : ''}${momDelta.percent.toFixed(0)}% vs last month so far.`,
      };
    }
  }

  if (recent.length > 0) {
    const biggest = recent.reduce((max, item) => (item.cost > max.cost ? item : max), recent[0]);
    if (biggest.cost > 0) {
      return {
        headline: `Biggest expense this month: ${biggest.description} (${formatMoney(biggest.cost)})`,
        detail: `${dayLabel(parseAppDate(biggest.date))} · ${biggest.category}`,
      };
    }
  }

  return null;
}

const DashboardPage: React.FC = () => {
  const [data, setData] = React.useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const now = React.useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const navigate = useNavigate();
  const theme = useTheme();
  // Gates the mobile-only type-to-log bar (TrackSpense v3 Mobile design) — desktop has its own
  // equivalent bar in the header now (App.tsx). Same breakpoint BottomNav/SideNav switch chrome
  // at. TrueTotalHero's lens toggle is unconditional (both breakpoints) — see `lens` below.
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [lens, setLens] = React.useState<SpendLens>('share');
  const queryClient = useQueryClient();
  const user = localStorage.getItem('vs_user') || '';
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const [groups, setGroups] = React.useState<GroupSummary[]>([]);
  const [groupExpenses, setGroupExpenses] = React.useState<UnifiedGroupExpenseRow[]>([]);
  const [personalRecent, setPersonalRecent] = React.useState<{ date: string; description: string; category: string; cost: number }[]>([]);
  const [showCombinedToast, setShowCombinedToast] = React.useState(false);
  const [changeInsights, setChangeInsights] = React.useState<ChangeInsight[]>([]);
  const [yearTrend, setYearTrend] = React.useState<{ month: string; total: number }[]>([]);
  // TS-DES-111: bumped whenever the global Add Expense FAB (MainLayout.tsx)
  // saves — DashboardPage fetches via plain useEffect rather than react-query,
  // so it can't rely on query-cache invalidation and needs its own signal to
  // refetch while mounted.
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => onExpenseChanged(() => setRefreshKey((k) => k + 1)), []);

  React.useEffect(() => {
    const user = localStorage.getItem('vs_user');
    if (!user) {
      setError('Please login to view dashboard.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // Combined = personal + user's share across all groups (spec §11.2/§17.1);
        // the True Total hero re-scopes this same fetched payload via its lens.
        // TS-DES-111: current month only — previously fetched the whole calendar
        // year (year with no month) while the hero label claimed to be month-scoped.
        const resp = await getAnalysis({ year, month, scope: 'combined' });
        setData(resp);
        if (!localStorage.getItem(COMBINED_TOAST_KEY)) {
          setShowCombinedToast(true);
          localStorage.setItem(COMBINED_TOAST_KEY, '1');
        }
      } catch (e) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    })();
  }, [year, month, refreshKey]);

  // TS-DES-111: a separate, year-wide fetch purely for `monthly_trend` — once the
  // main fetch above is scoped to a single month (the bug fix), its own
  // `monthly_trend` only ever contains that one month, so there's no prior-month
  // entry left to diff against for the hero's month-over-month delta.
  React.useEffect(() => {
    const user = localStorage.getItem('vs_user');
    if (!user) return;
    (async () => {
      try {
        const resp = await getAnalysis({ year, scope: 'combined' });
        setYearTrend(resp.monthly_trend);
      } catch {
        setYearTrend([]);
      }
    })();
  }, [year, refreshKey]);

  // TS-DES-111, scope reused by TS-DES-203's InsightOfTheDay: ranked change insights for the
  // current month, same scope as the main fetch.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const insights = await getChangeInsights({ year, month });
        if (mounted) setChangeInsights(insights);
      } catch {
        if (mounted) setChangeInsights([]);
      }
    })();
    return () => { mounted = false; };
  }, [year, month, refreshKey]);

  // Unified recent-transactions feed: personal + (if enabled) my group shares, merged.
  // `refreshKey` is part of the query key (not just invalidated) so a bump forces a refetch even
  // though this page fetches everything else via plain useEffect — matches how the effects below
  // already depend on it. Previously missing here, so Quick Capture/chat/type-to-log saves never
  // showed up in Recent without navigating away and back.
  const expensesQuery = useQuery({
    queryKey: ['dashboard-expenses', user, refreshKey],
    queryFn: () => listExpenses(0, 50),
    enabled: !!user,
  });

  React.useEffect(() => {
    if (expensesQuery.data) {
      setPersonalRecent(
        expensesQuery.data.items.map(e => ({ date: e.date, description: e.description, category: e.category, cost: e.cost }))
      );
    }
  }, [expensesQuery.data]);

  React.useEffect(() => {
    if (!groupsEnabled) {
      setGroupExpenses([]);
      setGroups([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const [rows, groupList] = await Promise.all([listAllMyGroupExpenses(), listGroups()]);
        if (mounted) {
          setGroupExpenses(rows);
          setGroups(groupList);
        }
      } catch {
        if (mounted) {
          setGroupExpenses([]);
          setGroups([]);
        }
      }
    })();
    return () => { mounted = false; };
    // refreshKey: same reason as expensesQuery above — a group expense logged via Quick
    // Capture/chat/type-to-log needs this to refetch too, not just the personal list.
  }, [groupsEnabled, refreshKey]);

  if (loading) return <Typography sx={{ mt: 4 }}>Loading dashboard...</Typography>;
  if (error) return <Typography color="error" sx={{ mt: 4 }}>{error}</Typography>;
  if (!data) return null;

  // Unified feed (spec §11.2): personal expenses + my share of group expenses,
  // group rows tagged with a badge + full amount so "my share" reads as primary.
  const unifiedRecentSource = [
    ...personalRecent.map(e => ({ ...e })),
    ...groupExpenses.map(e => ({
      date: e.date,
      description: e.description,
      category: e.category,
      cost: e.my_share,
      groupName: e.group_name,
      groupTotal: e.cost,
    })),
  ];
  const recent = unifiedRecentSource
    .sort((a, b) => parseAppDate(b.date).getTime() - parseAppDate(a.date).getTime())
    .slice(0, RECENT_FEED_LIMIT);

  const periodLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const groupSummaries = data.group_summaries || [];
  const personalTotal = data.spend_breakdown ? data.spend_breakdown.personal : data.total_expenses;

  // TS-DES-111: month-over-month delta for the hero, from the separate
  // year-wide `yearTrend` fetch (the main `data` fetch is scoped to a single
  // month, so its own monthly_trend has nothing to compare against). Null
  // (not zero) when there's no previous-month entry, e.g. a brand-new user's
  // first month, or when the previous month spills into the prior year and
  // that year's data isn't part of this fetch (rare edge case — January's
  // "last month" is December of the prior year; treated as "no data" rather
  // than issuing a third fetch for one extra month).
  const thisMonthKey = `${year}-${String(month).padStart(2, '0')}`;
  const prevDate = new Date(year, month - 2, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthTrend = yearTrend.find(m => m.month === thisMonthKey)?.total;
  const prevMonthTrend = yearTrend.find(m => m.month === prevMonthKey)?.total;
  const momDelta = (thisMonthTrend != null && prevMonthTrend != null && prevMonthTrend > 0)
    ? { amount: thisMonthTrend - prevMonthTrend, percent: ((thisMonthTrend - prevMonthTrend) / prevMonthTrend) * 100 }
    : null;

  // TS-DES-203: picks the single most notable insight to show — a ranked backend change
  // insight (covers category-spike/new-merchant/etc., per TS-ANL-004's 7 types) takes priority
  // since it's already relevance-ranked server-side; falls back to a locally-computed pace
  // projection, then the single biggest expense this month; null (renders nothing) if none of
  // the three have anything to say. Replaces TS-DES-111's three permanent strips with one line.
  const insight = pickInsight(changeInsights, personalTotal, momDelta, now, recent);

  const hasGroupsStrip = groupsEnabled && groups.length > 0;

  return (
    // TS-DES-210 desktop fix: this page was still capped at the mobile prototype's card width
    // (480px, centered) at every viewport, per Live_QA_Findings_and_Plan.md's "Dashboard's inner
    // content doesn't use its container width at desktop size" finding. `md`+ now uses the full
    // width MainLayout's sidebar-aware content column provides, matching DesktopDashboard.jsx;
    // `xs`/`sm` keep the original bounded, centered mobile layout unchanged.
    <Box sx={{ maxWidth: { xs: 480, md: '100%' }, mx: { xs: 'auto', md: 0 } }}>
      {/* Mobile-only (TrackSpense v3 Mobile design) — desktop's Dashboard is unchanged. */}
      {isMobile && <TypeToLogBar />}

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <TrueTotalHero
          personalTotal={personalTotal}
          spendBreakdown={data.spend_breakdown}
          groupSummaries={groupSummaries}
          groupsEnabled={groupsEnabled}
          periodLabel={periodLabel}
          momDelta={momDelta}
          lens={lens}
          onLensChange={setLens}
        />
      </motion.div>

      {insight && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* DesktopDashboard.jsx caps the insight line at 420px instead of spanning the full
              two-column content width below it. */}
          <Box sx={{ mb: 3, maxWidth: { xs: '100%', md: 420 } }}>
            <InsightOfTheDay insight={insight} />
          </Box>
        </motion.div>
      )}

      {/* DesktopDashboard.jsx puts "Where it went" and "My Groups" side by side
          (`grid-cols-2`); stacked full-width on mobile, same as before. When there's no groups
          strip to show, SpendSpectrum keeps the full row rather than leaving an empty column. */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 0, md: 4 } }}>
        <motion.div
          style={{ flex: 1, minWidth: 0 }}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <Box sx={{ mb: 3 }}>
            <SpendSpectrum data={data.category_totals} />
          </Box>
        </motion.div>

        {hasGroupsStrip && (
          <motion.div
            style={{ flex: 1, minWidth: 0 }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
          >
            <Box sx={{ mb: 3 }}>
              <MyGroupsStrip groups={groups} groupSummaries={groupSummaries} />
            </Box>
          </motion.div>
        )}
      </Box>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
      >
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em' }}>
              RECENT
            </Typography>
            <Typography
              variant="caption"
              onClick={() => navigate('/expenses')}
              sx={{ color: 'text.secondary', cursor: 'pointer', display: 'flex', alignItems: 'center', '&:hover': { color: 'text.primary' } }}
            >
              See all ›
            </Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: `${slate.radius.surface}px`,
              overflow: 'hidden',
            }}
          >
            {recent.length === 0 && (
              <Box sx={{ p: 2 }}>
                <Typography color="text.secondary" align="center">No recent transactions</Typography>
              </Box>
            )}
            {recent.map((item, idx) => (
              <Box
                key={`${item.date}-${item.description}-${idx}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.5,
                  borderBottom: idx < recent.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }} noWrap>
                    {item.description}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                    {dayLabel(parseAppDate(item.date))} · {(item as any).groupName ? `${(item as any).groupName} · your share` : item.category}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', ...tabularNums }}>
                  {formatMoney(item.cost)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </motion.div>

      <Snackbar
        open={showCombinedToast}
        autoHideDuration={6000}
        onClose={() => setShowCombinedToast(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowCombinedToast(false)} severity="info" variant="filled" sx={{ width: '100%' }}>
          Your totals now include your share of group expenses.
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DashboardPage;
