import React from 'react';
import MetricCard from '../components/dashboard/MetricCard';
import RecentActivityList from '../components/dashboard/RecentActivityList';
import CategoryBreakdownSunburst from '../components/dashboard/CategoryBreakdownSunburst';
import QuickAddExpenseCard from '../components/dashboard/QuickAddExpenseCard';
import SpendTrendChart from '../components/dashboard/SpendTrendChart';
import UpcomingRecurringCard from '../components/dashboard/UpcomingRecurringCard';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { parseAppDate } from '../utils/date';
import { listRecurringTemplates, RecurringTemplateDTO } from '../api/recurring';

const DashboardPage: React.FC = () => {
  const [data, setData] = React.useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [templates, setTemplates] = React.useState<RecurringTemplateDTO[] | null>(null);
  const [editingLayout, setEditingLayout] = React.useState(false);
  const [layoutOrder, setLayoutOrder] = React.useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vs_dashboard_layout_v1') || '[]');
    } catch {
      return [];
    }
  });
  const year = new Date().getFullYear();

  React.useEffect(() => {
    const user = localStorage.getItem('vs_user');
    if (!user) {
      setError('Please login to view dashboard.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const resp = await getAnalysis(user, { year });
        setData(resp);
      } catch (e) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    })();
  }, [year]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const t = await listRecurringTemplates();
        if (mounted) setTemplates(t);
      } catch {
        if (mounted) setTemplates([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <Typography sx={{ mt: 4 }}>Loading dashboard...</Typography>;
  if (error) return <Typography color="error" sx={{ mt: 4 }}>{error}</Typography>;
  if (!data) return null;

  const expenses = data.category_expense_details
    ? Object.values(data.category_expense_details).flat()
    : [];
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthTotal = data.monthly_trend.find(m => m.month === thisMonthKey)?.total || 0;
  const weekAgo = new Date();
  weekAgo.setDate(now.getDate() - 7);
  const thisWeekTotal = expenses
    .filter(e => parseAppDate(e.date) >= weekAgo && parseAppDate(e.date) <= now)
    .reduce((sum, e) => sum + e.cost, 0);
  const recent = [...expenses]
    .sort((a, b) => parseAppDate(b.date).getTime() - parseAppDate(a.date).getTime())
    .slice(0, 10);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Build split totals for current month: recurring (by template) vs other (by category)
  const templateMap = new Map<string, RecurringTemplateDTO>((templates || []).map(t => [`${t.description}||${t.category}`, t]));
  const recurringTotals: Record<string, number> = {};
  const otherTotals: Record<string, number> = {};
  const recurringDetailMap: Record<string, { date: string; description: string; cost: number }[]> = {};
  const otherDetailMap: Record<string, { date: string; description: string; cost: number }[]> = {};
  expenses.forEach(e => {
    const d = parseAppDate(e.date);
    if (d >= monthStart && d <= now) {
      const key = `${e.description}||${e.category}`;
      const t = templateMap.get(key);
      if (t) {
        const label = t.description; // group recurring by template description for clarity
        recurringTotals[label] = (recurringTotals[label] || 0) + e.cost;
        (recurringDetailMap[label] = recurringDetailMap[label] || []).push({ date: e.date, description: e.description, cost: e.cost });
      } else {
        otherTotals[e.category] = (otherTotals[e.category] || 0) + e.cost;
        (otherDetailMap[e.category] = otherDetailMap[e.category] || []).push({ date: e.date, description: e.description, cost: e.cost });
      }
    }
  });
  const sunburstRecurring = Object.entries(recurringTotals).map(([category, total]) => ({ category, total }));
  const sunburstOther = Object.entries(otherTotals).map(([category, total]) => ({ category, total }));

  const fetchData = async () => {
    const user = localStorage.getItem('vs_user');
    if (!user) return;
    const resp = await getAnalysis(user, { year });
    setData(resp);
  };

  // Card registry for customizable layout
  const cards: Record<string, { id: string; md: number; element: React.ReactNode }> = {
    sunburstOther: { id: 'sunburstOther', md: 8, element: <CategoryBreakdownSunburst title="Other Expenses (This Month)" data={sunburstOther} details={otherDetailMap} /> },
    sunburstRecurring: { id: 'sunburstRecurring', md: 4, element: <CategoryBreakdownSunburst title="Recurring (This Month)" data={sunburstRecurring} details={recurringDetailMap} /> },
    trend: { id: 'trend', md: 8, element: <SpendTrendChart data={data.monthly_trend.slice(-12)} /> },
    recent: { id: 'recent', md: 8, element: <RecentActivityList items={recent} /> },
    quickAdd: { id: 'quickAdd', md: 4, element: <QuickAddExpenseCard onAdded={fetchData} /> },
    upcoming: { id: 'upcoming', md: 4, element: <UpcomingRecurringCard /> },
  };
  const defaultOrder = ['sunburstOther', 'sunburstRecurring', 'trend', 'quickAdd', 'recent', 'upcoming'];
  const order = (layoutOrder && layoutOrder.length ? layoutOrder : defaultOrder).filter(id => cards[id]);

  // DnD handlers
  const onDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!editingLayout) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    if (!editingLayout) return;
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) return;
    const newOrder = [...order];
    const from = newOrder.indexOf(sourceId);
    const to = newOrder.indexOf(targetId);
    if (from === -1 || to === -1) return;
    newOrder.splice(from, 1);
    newOrder.splice(to, 0, sourceId);
    setLayoutOrder(newOrder);
  };
  const saveLayout = () => {
    localStorage.setItem('vs_dashboard_layout_v1', JSON.stringify(order));
    setEditingLayout(false);
  };
  const resetLayout = () => {
    localStorage.removeItem('vs_dashboard_layout_v1');
    setLayoutOrder(defaultOrder);
  };

  return (
    <Box sx={{ animation: 'fadeIn 0.5s ease' }}>
      <Grid container columns={12} spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <MetricCard label="Total Expenses" value={`$${data.total_expenses.toFixed(2)}`} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <MetricCard label="This Month" value={`$${thisMonthTotal.toFixed(2)}`} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <MetricCard label="This Week" value={`$${thisWeekTotal.toFixed(2)}`} />
        </Grid>
        {null}
      </Grid>
      {/* Customize controls */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        {!editingLayout ? (
          <Button size="small" variant="outlined" onClick={() => setEditingLayout(true)}>Customize Layout</Button>
        ) : (
          <>
            <Button size="small" variant="contained" onClick={saveLayout}>Save Layout</Button>
            <Button size="small" variant="text" onClick={resetLayout}>Reset</Button>
            <Typography variant="caption" sx={{ alignSelf: 'center', color: 'text.secondary' }}>Drag cards to reorder</Typography>
          </>
        )}
      </Box>

      {/* Customizable grid */}
      <Grid container columns={12} spacing={2} sx={{ mt: 1 }}>
        {order.map((id) => {
          const c = cards[id];
          if (!c) return null;
          return (
            <Grid key={id} size={{ xs: 12, md: c.md }}>
              <Box
                draggable={editingLayout}
                onDragStart={(e) => onDragStart(e, id)}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, id)}
                sx={{ border: editingLayout ? '1px dashed rgba(0,0,0,0.3)' : 'none', borderRadius: 1, cursor: editingLayout ? 'grab' : 'default' }}
              >
                {c.element}
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default DashboardPage;
