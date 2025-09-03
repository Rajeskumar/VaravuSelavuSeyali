import React, { useMemo, useState } from 'react';
import { Box, Grid, Typography, FormControl, InputLabel, Select, MenuItem, Paper, Divider, Switch, FormControlLabel } from '@mui/material';
import ExpenseSummaryCards from '../components/analysis/ExpenseSummaryCards';
import CategoryBarChart from '../components/analysis/CategoryBarChart';
import CategorySummaryTable from '../components/analysis/CategorySummaryTable';
import MonthlyTrendLineChart from '../components/analysis/MonthlyTrendLineChart';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { useQuery } from '@tanstack/react-query';

const ExpenseAnalysisPage: React.FC = () => {
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
      return getAnalysis(user, opts);
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
    backdropFilter: 'blur(8px)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(240,248,255,0.65) 100%)',
    border: '1px solid rgba(255,255,255,0.35)',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
    borderRadius: 3,
    animation: 'fadeIn 0.5s ease',
  } as const;

  return (
    <Box sx={{ mt: 4, animation: 'fadeIn 0.5s ease' }}>
      <Grid container columns={12} spacing={2}>
        {/* Sidebar */}
        <Grid size={{ xs: 12, md: 3 }}>
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
        </Grid>

        {/* Content */}
        <Grid size={{ xs: 12, md: 9 }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>{title}</Typography>

          {data.filter_info && (
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#fafafa', ...glass }}>
              <Typography variant="caption" color="text.secondary">
                Filters applied — user_col: {data.filter_info.applied_user_col || 'none'}, year: {String(data.filter_info.year || '')}, month: {String(data.filter_info.month || '')}, rows: {String(data.filter_info.row_count || 0)}
              </Typography>
            </Paper>
          )}

          <Paper elevation={2} sx={{ p: 2, mb: 2, ...glass }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Summary</Typography>
            <ExpenseSummaryCards totalExpenses={data.total_expenses} income={income} />
          </Paper>

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

          {/* Optional: Keep last six months for context if desired; currently hidden for month view to avoid mixing data */}
          {/* <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Last 6 Months</Typography>
            <Grid container columns={12}>
              <Grid size={{ xs: 12 }}>
                <LastSixMonthsLineChart monthlyTrend={data.monthly_trend} />
              </Grid>
            </Grid>
          </Paper> */}
        </Grid>
      </Grid>
    </Box>
  );
};

export default ExpenseAnalysisPage;
