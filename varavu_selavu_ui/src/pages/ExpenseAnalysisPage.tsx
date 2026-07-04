import React, { useMemo, useState } from 'react';
import { Box, Grid, Typography, FormControl, InputLabel, Select, MenuItem, Paper, Divider, Switch, FormControlLabel, Chip, Button } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import StorefrontIcon from '@mui/icons-material/StorefrontRounded';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBagRounded';
import QueryStatsIcon from '@mui/icons-material/QueryStatsRounded';
import { useTheme } from '@mui/material/styles';
import ExpenseSummaryCards from '../components/analysis/ExpenseSummaryCards';
import CategoryBarChart from '../components/analysis/CategoryBarChart';
import CategorySummaryTable from '../components/analysis/CategorySummaryTable';
import MonthlyTrendLineChart from '../components/analysis/MonthlyTrendLineChart';
import SmartChangeInsightsCard from '../components/analysis/SmartChangeInsightsCard';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { useQuery } from '@tanstack/react-query';
import { glassCardSx } from '../theme';
import { motion } from 'framer-motion';

const ExpenseAnalysisPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const income = 6200; // same default used in legacy app
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [overallYear, setOverallYear] = useState<boolean>(false);

  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const { data: qData, isLoading, isError, error } = useQuery({
    queryKey: ['analysis', user, year, overallYear ? null : month],
    queryFn: async () => {
      if (!user) throw new Error('Please login to view analysis.');
      const opts: { year?: number; month?: number } = { year };
      if (!overallYear) opts.month = month;
      return getAnalysis(opts);
    },
    enabled: !!user,
  });
  React.useEffect(() => {
    if (qData) setData(qData);
  }, [qData]);

  if (isLoading) return <Typography sx={{ mt: 4 }}>Loading analysis...</Typography>;
  if (isError) return <Typography color="error" sx={{ mt: 4 }}>{(error as Error)?.message || 'Failed to load analysis.'}</Typography>;
  if (!data) return null;

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const title = overallYear ? `Analysis — ${year} (Year Overview)` : `Analysis — ${monthNames[month-1]} ${year}`;

  const glass = {
    ...glassCardSx(theme),
    animation: 'fadeIn 0.5s ease',
  } as const;

  return (
    <Box sx={{ mt: 4 }}>
      <Grid container columns={12} spacing={2}>
        {/* Sidebar */}
        <Grid size={{ xs: 12, md: 3 }}>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <Paper elevation={3} sx={{ p: 2, position: { md: 'sticky' }, top: { md: 80 }, mb: { xs: 2, md: 0 }, ...glass }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Filters</Typography>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel id="year-label">Year</InputLabel>
                <Select labelId="year-label" label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {[0,1,2,3,4].map((i) => {
                    const y = now.getFullYear() - i;
                    return <MenuItem key={y} value={y}>{y}</MenuItem>;
                  })}
                </Select>
              </FormControl>
              <FormControlLabel
                control={<Switch checked={overallYear} onChange={(e) => setOverallYear(e.target.checked)} />}
                label="Overall Year"
                sx={{ mb: 1 }}
              />
              {!overallYear && (
                <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                  <InputLabel id="month-label">Month</InputLabel>
                  <Select labelId="month-label" label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                    {monthNames.map((m, idx) => (
                      <MenuItem key={m} value={idx + 1}>{m}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary">
                Tip: Toggle Overall Year to see trends and category distribution for the entire year.
              </Typography>
            </Paper>
          </motion.div>
        </Grid>

        {/* Content */}
        <Grid size={{ xs: 12, md: 9 }}>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{title}</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip
                  component={RouterLink as any}
                  to="/item-insights"
                  clickable
                  icon={<ShoppingBasketIcon />}
                  label="Item Insights"
                  variant="outlined"
                />
                <Chip
                  component={RouterLink as any}
                  to="/merchant-insights"
                  clickable
                  icon={<StorefrontIcon />}
                  label="Merchant Insights"
                  variant="outlined"
                />
              </Box>
            </Box>

            {data.filter_info && (
              <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#fafafa', ...glass }}>
                <Typography variant="caption" color="text.secondary">
                  Filters applied — user_col: {data.filter_info.applied_user_col || 'none'}, year: {String(data.filter_info.year || '')}, month: {String(data.filter_info.month || '')}, rows: {String(data.filter_info.row_count || 0)}
                </Typography>
              </Paper>
            )}

            {data.total_expenses === 0 && data.category_totals.length === 0 ? (
              <Paper sx={{ ...glass, p: 6, mb: 2, borderRadius: 3, textAlign: 'center' }}>
                <QueryStatsIcon sx={{ fontSize: 64, color: 'primary.light', mb: 2 }} />
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  No expenses for {overallYear ? year : `${monthNames[month - 1]} ${year}`} yet
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  Add an expense to see category breakdowns, trends, and what changed.
                </Typography>
                <Button variant="contained" onClick={() => navigate('/expenses')} startIcon={<ShoppingBasketIcon />}>
                  Add an Expense
                </Button>
              </Paper>
            ) : (
              <>
                <Grid container columns={12} spacing={2} sx={{ mb: 2 }}>
                   <Grid size={{ xs: 12, md: 7 }}>
                      <Paper elevation={2} sx={{ p: 2, height: '100%', ...glass }}>
                        <Typography variant="h6" sx={{ mb: 1 }}>Summary</Typography>
                        <ExpenseSummaryCards totalExpenses={data.total_expenses} income={income} />
                      </Paper>
                   </Grid>
                   <Grid size={{ xs: 12, md: 5 }}>
                       <Paper elevation={2} sx={{ p: 2, height: '100%', ...glass }}>
                         <Typography variant="h6" sx={{ mb: 1 }}>What Changed</Typography>
                         <SmartChangeInsightsCard userId={user} year={year} month={overallYear ? undefined : month} />
                       </Paper>
                   </Grid>
                </Grid>

                <Paper elevation={2} sx={{ p: 2, mb: 2, ...glass }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>Top Categories</Typography>
                  <Grid container columns={12}>
                    <Grid size={{ xs: 12 }}>
                      <CategoryBarChart categoryTotals={data.category_totals} details={data.category_expense_details || {}} />
                    </Grid>
                  </Grid>
                </Paper>

                <Paper elevation={2} sx={{ p: 2, mb: 2, ...glass }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>Category Breakdown</Typography>
                  <CategorySummaryTable categoryTotals={data.category_totals} income={income} details={data.category_expense_details || {}} />
                </Paper>

                {overallYear ? (
                  <Paper elevation={2} sx={{ p: 2, mb: 2, ...glass }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>Monthly Trend</Typography>
                    <Grid container columns={12}>
                      <Grid size={{ xs: 12 }}>
                        <MonthlyTrendLineChart monthlyTrend={data.monthly_trend} />
                      </Grid>
                    </Grid>
                  </Paper>
                ) : null}
              </>
            )}
          </motion.div>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ExpenseAnalysisPage;
