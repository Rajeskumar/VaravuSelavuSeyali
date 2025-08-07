import React from 'react';
import MetricCard from '../components/dashboard/MetricCard';
import MonthlyTrendChart from '../components/dashboard/MonthlyTrendChart';
import TopCategoriesChart from '../components/dashboard/TopCategoriesChart';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';

const HomePage: React.FC = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Grid container spacing={2} justifyContent="center" alignItems="stretch" sx={{ mb: 2 }}>
        <Grid size={12}>
          <MetricCard label="💸 Total Expenses" value="$1,234.56" />
        </Grid>
        <Grid size={12}>
          <MetricCard label="📊 Total Categories" value={12} />
        </Grid>
        <Grid size={12}>
          <MetricCard label="📅 Months Tracked" value={5} />
        </Grid>
      </Grid>
      <Grid container spacing={2} justifyContent="center">
        <Grid size={12}>
          <MonthlyTrendChart />
        </Grid>
        <Grid size={12}>
          <TopCategoriesChart />
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage;
