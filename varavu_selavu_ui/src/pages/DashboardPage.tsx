import React from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { motion } from 'framer-motion';
import TrueTotalHero, { TrueTotalLens } from '../components/dashboard/TrueTotalHero';
import SpendSpectrum from '../components/dashboard/SpendSpectrum';
import MyGroupsStrip from '../components/dashboard/MyGroupsStrip';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { parseAppDate, formatAppDate } from '../utils/date';
import { listExpenses } from '../api/expenses';
import { listAllMyGroupExpenses, listGroups, UnifiedGroupExpenseRow, GroupSummary } from '../api/groups';
import { useGroupsEnabled } from '../hooks/useGroupsEnabled';
import { reconcile, tabularNums } from '../theme';

const COMBINED_TOAST_KEY = 'vs_combined_toast_shown_v1';
const RECENT_FEED_LIMIT = 6;

function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

const DashboardPage: React.FC = () => {
  const [data, setData] = React.useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lens, setLens] = React.useState<TrueTotalLens>('my_share');
  const year = new Date().getFullYear();
  const navigate = useNavigate();
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const [groups, setGroups] = React.useState<GroupSummary[]>([]);
  const [groupExpenses, setGroupExpenses] = React.useState<UnifiedGroupExpenseRow[]>([]);
  const [personalRecent, setPersonalRecent] = React.useState<{ date: string; description: string; category: string; cost: number }[]>([]);
  const [showCombinedToast, setShowCombinedToast] = React.useState(false);

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
        const resp = await getAnalysis({ year, scope: 'combined' });
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
  }, [year]);

  // Unified recent-transactions feed: personal + (if enabled) my group shares, merged.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await listExpenses(0, 50);
        if (mounted) setPersonalRecent(resp.items.map(e => ({ date: e.date, description: e.description, category: e.category, cost: e.cost })));
      } catch {
        if (mounted) setPersonalRecent([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

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
  }, [groupsEnabled]);

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

  const now = new Date();
  const periodLabel = `${now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · everything`;
  const groupSummaries = data.group_summaries || [];
  const personalTotal = data.spend_breakdown ? data.spend_breakdown.personal : data.total_expenses;

  return (
    <Box sx={{ maxWidth: 480, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <TrueTotalHero
          lens={lens}
          onLensChange={setLens}
          personalTotal={personalTotal}
          spendBreakdown={data.spend_breakdown}
          groupSummaries={groupSummaries}
          groupsEnabled={groupsEnabled}
          periodLabel={periodLabel}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <Box sx={{ mb: 3 }}>
          <SpendSpectrum data={data.category_totals} />
        </Box>
      </motion.div>

      {groupsEnabled && groups.length > 0 && (
        <motion.div
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
              borderRadius: `${reconcile.radius.surface}px`,
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
                    {formatAppDate(item.date)} · {(item as any).groupName ? `${(item as any).groupName} · your share` : item.category}
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
