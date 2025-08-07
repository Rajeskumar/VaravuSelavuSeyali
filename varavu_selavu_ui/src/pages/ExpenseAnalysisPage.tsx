import React from 'react';
import { Box, Grid } from '@mui/material';
import ExpenseSummaryCards from '../components/analysis/ExpenseSummaryCards';
import CategoryBarChart from '../components/analysis/CategoryBarChart';
import CategorySummaryTable from '../components/analysis/CategorySummaryTable';
import LastSixMonthsLineChart from '../components/analysis/LastSixMonthsLineChart';
import MonthlyTrendLineChart from '../components/analysis/MonthlyTrendLineChart';

const ExpenseAnalysisPage: React.FC = () => {
  // For now, mock state and props will be used
  return (
    <Box sx={{ mt: 4 }}>
      <ExpenseSummaryCards />
      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid size={6}>
          <CategoryBarChart />
        </Grid>
        <Grid size={6}>
          <CategorySummaryTable />
        </Grid>
      </Grid>
      <Box sx={{ mt: 4 }}>
        <LastSixMonthsLineChart />
      </Box>
      <Box sx={{ mt: 4 }}>
        <MonthlyTrendLineChart />
      </Box>
    </Box>
  );
};

export default ExpenseAnalysisPage;
