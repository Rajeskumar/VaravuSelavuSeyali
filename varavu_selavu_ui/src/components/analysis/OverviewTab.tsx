import React, { useMemo, useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, IconButton, Menu, MenuItem, Button, Switch, FormControlLabel } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useNavigate } from 'react-router-dom';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBagRounded';
import QueryStatsIcon from '@mui/icons-material/QueryStatsRounded';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthRounded';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';

import { getAnalysis } from '../../api/analysis';
import { ChangeInsight } from '../../api/analytics';
import { glassCardSx } from '../../theme';

import SegmentedTabs from '../common/SegmentedTabs';
import { TrendNavigator } from './TrendNavigator';
import { WhatChangedRail } from './WhatChangedRail';
import { CategorySpectrum } from './CategorySpectrum';
import { AskSheet } from './AskSheet';
import MoneyFlowSankey from './MoneyFlowSankey';

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type PeriodMode = 'month' | 'year';

/**
 * TS-DES-205 — Overview tab, migrated from the standalone `ExpenseAnalysisPage.tsx` (which is
 * now this tab host's page component, not this content). The page-level "Analysis" title and
 * `SubTabBar` now live in the parent; this component owns only what's specific to Overview
 * (year/month picker, trend nav, what-changed rail, category spectrum, treemap). The old
 * "Items"/"Merchants" quick-jump chips are dropped — the `SubTabBar` immediately above this tab
 * already covers that navigation, so keeping both would be two ways to do the same thing.
 *
 * The My Expenses/I Paid lens (`AnalysisLensSwitch`) that used to live here was removed —
 * `i_paid` mixed "money currently out of my account, most of which comes back" into a page about
 * what was actually spent; see `TrueTotalHero.tsx`'s `computeMyExpensesTotal` comment for the
 * full reasoning (the same call was made on the Dashboard, though that page's hero later grew a
 * different, narrower toggle back — see `TrueTotalHero.tsx`'s `lens` prop). That's a distinct
 * question from this tab's own `includeGroups` toggle below (TrackSpense v3 Prototype's one
 * proposed Analysis addition): whether group shares count *at all* in these breakdowns, not
 * which of two spend interpretations to show. Scope defaults to `'combined'` (personal + my
 * share of every group, unchanged from before) and switches to `'personal'` when toggled off.
 */
const OverviewTab: React.FC = () => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);

  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [askInsight, setAskInsight] = useState<ChangeInsight | null>(null);
  // TrackSpense v3 Prototype's one proposed Analysis change — defaults on (unchanged behavior).
  const [includeGroups, setIncludeGroups] = useState(true);
  const scope = includeGroups ? 'combined' : 'personal';

  // Year/Month dropdown anchor
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

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

  // 2. Fetch data for the entire year — powers the TrendNavigator's 6-month bars *and*, when
  // `periodMode === 'year'`, is the category-breakdown data source itself (answers "how much did
  // I spend in 2026 on rent/groceries/dining out", not just a single month at a time).
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

  const isYearMode = periodMode === 'year';
  // The active period's data — CategorySpectrum/MoneyFlowSankey/the empty-state check all read
  // from whichever of these is "the period" right now, so the year toggle only has to swap one
  // reference rather than thread a condition through every consumer.
  const periodData = isYearMode ? yearData : monthData;
  const periodDescriptor = isYearMode ? `${year}` : monthNames[month - 1];

  const trendNavigator = (
    <TrendNavigator
      monthlyTrend={yearData.monthly_trend}
      selectedMonth={month}
      year={year}
      onSelect={(m) => setMonth(m)}
    />
  );

  const whatChangedSection = (
    <Box sx={{ pt: 1, pb: 2 }}>
      <Typography sx={{ mb: 1.5, fontFamily: 'Instrument Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary', textTransform: 'uppercase' }}>
        WHAT CHANGED
      </Typography>
      <WhatChangedRail
        userId={user}
        year={year}
        month={isYearMode ? undefined : month}
        onAsk={setAskInsight}
      />
    </Box>
  );

  const categoryContent =
    periodData.total_expenses === 0 && periodData.category_totals.length === 0 ? (
      <Paper sx={{ ...glassCardSx(theme), p: 6, mb: 2, borderRadius: 1, textAlign: 'center' }}>
        <QueryStatsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" fontWeight={600} gutterBottom>
          No expenses yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Add an expense in {periodDescriptor} to see breakdowns.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/expenses')} startIcon={<ShoppingBasketIcon />}>
          Add Expense
        </Button>
      </Paper>
    ) : (
      <>
        <CategorySpectrum
          total={periodData.total_expenses}
          categoryTotals={periodData.category_totals}
          details={periodData.category_expense_details || {}}
        />

        <Box sx={{ mt: 4, mb: 4 }}>
          <MoneyFlowSankey
            totalExpenses={periodData.total_expenses}
            categoryTotals={periodData.category_totals}
            details={periodData.category_expense_details || {}}
          />
        </Box>
      </>
    );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 13, color: 'text.secondary' }}>
            {isYearMode ? year : `${monthNames[month - 1]} ${year}`}
          </Typography>
          <IconButton size="small" onClick={handleYearMonthClick} sx={{ p: 0.25, color: 'text.secondary' }}>
            <CalendarMonthIcon sx={{ fontSize: 16 }} />
          </IconButton>

          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
            {[0, 1, 2].map(i => {
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* TrackSpense v3 Prototype's one proposed Analysis addition — whether group shares
              count at all in the breakdowns below, not a spend-interpretation lens (see the
              component doc comment above for why this is a different question from that one). */}
          <FormControlLabel
            control={<Switch size="small" checked={includeGroups} onChange={(e) => setIncludeGroups(e.target.checked)} />}
            label={<Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 12.5, color: 'text.secondary' }}>Include group shares</Typography>}
            sx={{ mr: 0 }}
          />

          {/* Answers "how much did I spend in 2026 on rent/groceries/dining out" — Year swaps the
              category breakdown/treemap below to the whole calendar year's totals instead of just
              the selected month; Month is the original single-month view, unchanged. */}
          <Box sx={{ width: 160 }}>
            <SegmentedTabs<PeriodMode>
              value={periodMode}
              onChange={setPeriodMode}
              options={[
                { value: 'month', label: 'Month' },
                { value: 'year', label: 'Year' },
              ]}
              fullWidth
              ariaLabel="Category breakdown period"
            />
          </Box>
        </Box>
      </Box>

      {isDesktop ? (
        // TS-DES-210 desktop fix: DesktopAnalysis.jsx places the trend/category column and
        // the "what changed" rail side by side (`grid-cols-2`) — mobile keeps its original
        // stacked order (Trend, then What Changed, then Category) below; only desktop
        // reflows into two columns with What Changed as its own column, not interleaved.
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, alignItems: 'start' }}>
          <Box>
            {!isYearMode && trendNavigator}
            {categoryContent}
          </Box>
          <Box>{whatChangedSection}</Box>
        </Box>
      ) : (
        <>
          {!isYearMode && trendNavigator}
          {whatChangedSection}
          {categoryContent}
        </>
      )}

      <AskSheet
        insight={askInsight}
        onClose={() => setAskInsight(null)}
        year={year}
        month={month}
      />
    </Box>
  );
};

export default OverviewTab;
