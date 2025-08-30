import React from 'react';
import MetricCard from '../components/dashboard/MetricCard';
import RecentActivityList from '../components/dashboard/RecentActivityList';
import CategoryBreakdownSunburst from '../components/dashboard/CategoryBreakdownSunburst';
import QuickAddExpenseCard from '../components/dashboard/QuickAddExpenseCard';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { getAnalysis, AnalysisResponse } from '../api/analysis';

const DashboardPage: React.FC = () => {
  const [data, setData] = React.useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
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
    .filter(e => new Date(e.date) >= weekAgo && new Date(e.date) <= now)
    .reduce((sum, e) => sum + e.cost, 0);
  const recent = [...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const last3Start = new Date();
  last3Start.setMonth(now.getMonth() - 2);
  const last3Totals: Record<string, number> = {};
  expenses.forEach(e => {
    const d = new Date(e.date);
    if (d >= last3Start) {
      last3Totals[e.category] = (last3Totals[e.category] || 0) + e.cost;
    }
  });
  const sunburstData = Object.entries(last3Totals).map(([category, total]) => ({ category, total }));

  const fetchData = async () => {
    const user = localStorage.getItem('vs_user');
    if (!user) return;
    const resp = await getAnalysis(user, { year });
    setData(resp);
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
      </Grid>
      <Grid container columns={12} spacing={2} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <RecentActivityList items={recent} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Grid container columns={12} spacing={2}>
            <Grid size={{ xs: 12 }}>
              <CategoryBreakdownSunburst data={sunburstData} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <QuickAddExpenseCard onAdded={fetchData} />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
