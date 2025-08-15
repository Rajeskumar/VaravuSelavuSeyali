import React from 'react';
import MetricCard from '../components/dashboard/MetricCard';
import MonthlyTrendChart from '../components/dashboard/MonthlyTrendChart';
import TopCategoriesChart from '../components/dashboard/TopCategoriesChart';
import RecentActivityList from '../components/dashboard/RecentActivityList';
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
  const largest = expenses.reduce((max, e) => (e.cost > max.cost ? e : max), { cost: 0 } as any);
  const recent = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  return (
    <Box>
      <Grid container columns={12} spacing={2} justifyContent="center" alignItems="stretch" sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <MetricCard label="💸 Total Expenses (YTD)" value={`$${data.total_expenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <MetricCard label="📊 Total Categories" value={data.category_totals.length} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <MetricCard label="📅 Months Tracked" value={new Set(data.monthly_trend.map(m => m.month)).size} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <MetricCard label="🏆 Largest Transaction" value={largest.cost ? `$${largest.cost.toFixed(2)}` : '$0.00'} />
        </Grid>
      </Grid>
      <Grid container columns={12} spacing={2} justifyContent="center">
        <Grid size={{ xs: 12 }}>
          <MonthlyTrendChart monthlyTrend={data.monthly_trend} />
        </Grid>
      </Grid>
      <Grid container columns={12} spacing={2} justifyContent="center" sx={{ mt: 2 }}>
        <Grid size={{ xs: 12 }}>
          <TopCategoriesChart categoryTotals={data.category_totals} />
        </Grid>
      </Grid>
      <Grid container columns={12} spacing={2} justifyContent="center" sx={{ mt: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <RecentActivityList items={recent} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
