import React from 'react';
import MetricCard from '../components/dashboard/MetricCard';
import MonthlyTrendChart from '../components/dashboard/MonthlyTrendChart';
import TopCategoriesChart from '../components/dashboard/TopCategoriesChart';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { getAnalysis, AnalysisResponse } from '../api/analysis';

const HomePage: React.FC = () => {
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

  return (
    <Box sx={{ mt: 4 }}>
      <Grid container spacing={2} justifyContent="center" alignItems="stretch" sx={{ mb: 2 }}>
        <Grid size={4}>
          <MetricCard label="💸 Total Expenses (YTD)" value={`$${data.total_expenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        </Grid>
        <Grid size = {4}>
          <MetricCard label="📊 Total Categories" value={data.category_totals.length} />
        </Grid>
        <Grid size={4}>
          <MetricCard label="📅 Months Tracked" value={new Set(data.monthly_trend.map(m => m.month)).size} />
        </Grid>
      </Grid>
      <Grid container spacing={2} justifyContent="center">
        <Grid size={12}>
          <MonthlyTrendChart monthlyTrend={data.monthly_trend} />
        </Grid>
        <Grid size={12}>
          <TopCategoriesChart categoryTotals={data.category_totals} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage;
