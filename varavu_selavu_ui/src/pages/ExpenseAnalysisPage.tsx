import React, { useMemo, useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, Chip, Button, IconButton, Menu, MenuItem } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import StorefrontIcon from '@mui/icons-material/StorefrontRounded';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBagRounded';
import QueryStatsIcon from '@mui/icons-material/QueryStatsRounded';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthRounded';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';

import { getAnalysis, AnalysisResponse, AnalysisScope } from '../api/analysis';
import { ChangeInsight } from '../api/analytics';
import { useGroupsEnabled } from '../hooks/useGroupsEnabled';
import { glassCardSx, typeScale } from '../theme';

// New Reconcile components
import { AnalysisLensSwitch } from '../components/analysis/AnalysisLensSwitch';
import { TrendNavigator } from '../components/analysis/TrendNavigator';
import { WhatChangedRail } from '../components/analysis/WhatChangedRail';
import { CategorySpectrum } from '../components/analysis/CategorySpectrum';
import { AskSheet } from '../components/analysis/AskSheet';

// Keep existing Sankey for signature visual
import MoneyFlowSankey from '../components/analysis/MoneyFlowSankey';

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const ExpenseAnalysisPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);
  
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [scope, setScope] = useState<AnalysisScope>('combined');
  const [askInsight, setAskInsight] = useState<ChangeInsight | null>(null);
  
  // Year/Month dropdown anchor
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { enabled: groupsEnabled } = useGroupsEnabled();
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  // 1. Fetch data for the specific selected month
  const { data: monthData, isLoading: monthLoading, isError: monthIsError, error: monthError } = useQuery({
    queryKey: ['analysis', user, year, month, scope],
    queryFn: async () => {
      if (!user) throw new Error('Please login to view analysis.');
      return getAnalysis({ year, month, scope });
    },
    enabled: !!user,
  });

  // 2. Fetch data for the entire year to power the TrendNavigator
  const { data: yearData, isLoading: yearLoading } = useQuery({
    queryKey: ['analysis', user, year, null, scope],
    queryFn: async () => {
      if (!user) throw new Error('Please login to view analysis.');
      return getAnalysis({ year, scope });
    },
    enabled: !!user,
  });

  if (monthLoading || yearLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (monthIsError) {
    return (
      <Alert severity="error" sx={{ mt: 4 }}>
        {(monthError as Error)?.message || 'Failed to load analysis.'}
      </Alert>
    );
  }

  if (!monthData || !yearData) return null;

  const handleYearMonthClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', pb: 10 }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        
        {/* Header Area */}
        <Box sx={{ px: 2, pt: 3, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography sx={{ ...typeScale.display, fontSize: 28, color: 'text.primary' }}>
              Analysis
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              <Typography sx={{ fontFamily: 'Inter', fontSize: 13, color: 'text.secondary' }}>
                {monthNames[month - 1]} {year}
              </Typography>
              <IconButton size="small" onClick={handleYearMonthClick} sx={{ p: 0.25, color: 'text.secondary' }}>
                <CalendarMonthIcon sx={{ fontSize: 16 }} />
              </IconButton>
              
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
                {[0,1,2].map(i => {
                   const y = now.getFullYear() - i;
                   return (
                     <MenuItem 
                       key={y} 
                       onClick={() => { setYear(y); setMonth(now.getMonth() + 1); handleMenuClose(); }}
                       selected={year === y}
                     >
                       {y}
                     </MenuItem>
                   );
                })}
              </Menu>
            </Box>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip component={RouterLink as any} to="/item-insights" clickable icon={<ShoppingBasketIcon />} label="Items" variant="outlined" size="small" />
            <Chip component={RouterLink as any} to="/merchant-insights" clickable icon={<StorefrontIcon />} label="Merchants" variant="outlined" size="small" />
          </Box>
        </Box>

        {groupsEnabled && (
          <Box sx={{ px: 2, pb: 3 }}>
            <AnalysisLensSwitch value={scope} onChange={setScope} />
          </Box>
        )}

        {/* 6-Month Trend Navigator */}
        <TrendNavigator
          monthlyTrend={yearData.monthly_trend}
          selectedMonth={month}
          year={year}
          onSelect={(m) => setMonth(m)}
        />

        {/* What Changed Rail */}
        <Box sx={{ pt: 1, pb: 2 }}>
          <Typography sx={{ px: 2, mb: 1.5, fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary', textTransform: 'uppercase' }}>
            WHAT CHANGED
          </Typography>
          <WhatChangedRail
            userId={user}
            year={year}
            month={month}
            onAsk={setAskInsight}
          />
        </Box>

        {/* Empty State vs Content */}
        {monthData.total_expenses === 0 && monthData.category_totals.length === 0 ? (
          <Paper sx={{ ...glassCardSx(theme), mx: 2, p: 6, mb: 2, borderRadius: 3, textAlign: 'center' }}>
            <QueryStatsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" fontWeight={600} gutterBottom>
              No expenses yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Add an expense in {monthNames[month - 1]} to see breakdowns.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/expenses')} startIcon={<ShoppingBasketIcon />}>
              Add Expense
            </Button>
          </Paper>
        ) : (
          <>
            <CategorySpectrum
              total={monthData.total_expenses}
              categoryTotals={monthData.category_totals}
              details={monthData.category_expense_details || {}}
            />

            <Box sx={{ px: 2, mt: 4, mb: 4 }}>
              <MoneyFlowSankey
                totalExpenses={monthData.total_expenses}
                categoryTotals={monthData.category_totals}
                details={monthData.category_expense_details || {}}
              />
            </Box>
          </>
        )}
      </motion.div>

      <AskSheet
        insight={askInsight}
        onClose={() => setAskInsight(null)}
        year={year}
        month={month}
      />
    </Box>
  );
};

export default ExpenseAnalysisPage;
