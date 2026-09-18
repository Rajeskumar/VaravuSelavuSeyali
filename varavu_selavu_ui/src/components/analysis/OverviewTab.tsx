import React, { useMemo, useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, IconButton, Menu, MenuItem, Button, Switch, FormControlLabel, TextField } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useNavigate } from 'react-router-dom';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBagRounded';
import QueryStatsIcon from '@mui/icons-material/QueryStatsRounded';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthRounded';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';

import { getAnalysis, AnalysisScope } from '../../api/analysis';
import { listGroups } from '../../api/groups';
import { useGroupsEnabled } from '../../hooks/useGroupsEnabled';
import { ChangeInsight } from '../../api/analytics';
import { glassCardSx } from '../../theme';
import { useBudgetsEnabled } from '../../hooks/useBudgetsEnabled';
import { listBudgets, BudgetDTO } from '../../api/budgets';
import { useTagsEnabled } from '../../hooks/useTagsEnabled';

import SegmentedTabs from '../common/SegmentedTabs';
import { TrendNavigator } from './TrendNavigator';
import { WhatChangedRail } from './WhatChangedRail';
import { CategorySpectrum } from './CategorySpectrum';
import { AskSheet } from './AskSheet';
import MoneyFlowSankey from './MoneyFlowSankey';
import TagFilterSelect from '../tags/TagFilterSelect';

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
  // Collapsed by default — see the "See the money flow" toggle below CategorySpectrum.
  const [showFlow, setShowFlow] = useState(false);
  // TrackSpense v3 Prototype's one proposed Analysis change — defaults on (unchanged behavior).
  const [includeGroups, setIncludeGroups] = useState(true);
  // A single group's whole spend, analysed exactly like the personal view (categories, trend,
  // month/year). '' = the user's own spending, which is what this tab always showed before.
  const [groupId, setGroupId] = useState('');
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const { data: groups = [] } = useQuery({
    queryKey: ['groups', false],
    queryFn: () => listGroups(false),
    enabled: groupsEnabled,
  });
  const selectedGroup = groups.find((g) => g.group_id === groupId);
  const scope: AnalysisScope = groupId ? 'group' : includeGroups ? 'combined' : 'personal';
  const isYearMode = periodMode === 'year';

  const { enabled: budgetsEnabled } = useBudgetsEnabled();
  const { enabled: tagsEnabled } = useTagsEnabled();
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);

  // Year/Month dropdown anchor
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  // 1. Fetch data for the specific selected month
  const { data: monthData, isLoading: monthLoading, isError: monthIsError, error: monthError } = useQuery({
    queryKey: ['analysis', user, year, month, scope, groupId || null, tagFilterIds],
    queryFn: async () => {
      if (!user) throw new Error('Please login to view analysis.');
      return getAnalysis({ year, month, scope, group_id: groupId || undefined, tag_ids: tagFilterIds.length ? tagFilterIds : undefined });
    },
    enabled: !!user,
  });

  // 2. Fetch data for the entire year — powers the TrendNavigator's 6-month bars *and*, when
  // `periodMode === 'year'`, is the category-breakdown data source itself (answers "how much did
  // I spend in 2026 on rent/groceries/dining out", not just a single month at a time).
  const { data: yearData, isLoading: yearLoading } = useQuery({
    queryKey: ['analysis', user, year, null, scope, groupId || null, tagFilterIds],
    queryFn: async () => {
      if (!user) throw new Error('Please login to view analysis.');
      return getAnalysis({ year, scope, group_id: groupId || undefined, tag_ids: tagFilterIds.length ? tagFilterIds : undefined });
    },
    enabled: !!user,
  });

  // §6.2 — inline budget progress in the category breakdown, honoring this same Month/Year and
  // Include-group-shares toggles (the latter is already `scope` above). Budgets are monthly-only
  // in v1 (PRD §5.1/§11), so this only applies in month mode, not the whole-year rollup.
  const period = `${year}-${String(month).padStart(2, '0')}`;
  // Budgets are personal/combined only — no per-group budgets exist, hence the `!groupId` gate.
  const budgetScope = includeGroups ? 'combined' : 'personal';
  const { data: budgetsData } = useQuery({
    queryKey: ['budgets', budgetScope, period],
    queryFn: () => listBudgets({ scope: budgetScope, period }),
    enabled: !!user && budgetsEnabled && !isYearMode && !groupId,
  });
  const budgetsByCategory: Record<string, BudgetDTO> = {};
  for (const b of budgetsData || []) {
    if (b.target_type === 'category' && b.category) {
      budgetsByCategory[b.category] = b;
    }
  }

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

  // The active period's data — CategorySpectrum/MoneyFlowSankey/the empty-state check all read
  // from whichever of these is "the period" right now, so the year toggle only has to swap one
  // reference rather than thread a condition through every consumer.
  const periodData = isYearMode ? yearData : monthData;
  const periodDescriptor = isYearMode ? `${year}` : monthNames[month - 1];

  // TS-TAG-111 — share-aware totals (PRD §5.2/§9.6): "My Expenses" is the primary figure (personal
  // spend + my computed share of tagged group expenses), "I Paid" is secondary (what I actually
  // paid out). Both come pre-computed from the backend — never reimplement split math here.
  const tagScopedTotals =
    tagFilterIds.length > 0 && periodData.my_expenses_total != null ? (
      <Paper sx={{ ...glassCardSx(theme), p: 2, mb: 2, borderRadius: 1, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary', textTransform: 'uppercase' }}>
          Tag-scoped
        </Typography>
        <Box>
          <Typography variant="h6" fontWeight={700}>${periodData.my_expenses_total.toFixed(2)}</Typography>
          <Typography variant="caption" color="text.secondary">My Expenses</Typography>
        </Box>
        {periodData.i_paid_total != null && (
          <Box>
            <Typography variant="h6" fontWeight={700}>${periodData.i_paid_total.toFixed(2)}</Typography>
            <Typography variant="caption" color="text.secondary">I Paid</Typography>
          </Box>
        )}
      </Paper>
    ) : null;

  const trendNavigator = (
    <TrendNavigator
      monthlyTrend={yearData.monthly_trend}
      selectedMonth={month}
      year={year}
      onSelect={(m) => setMonth(m)}
    />
  );

  const whatChangedSection = groupId ? (
    <Box sx={{ pt: 1, pb: 2 }}>
      <Typography sx={{ mb: 1.5, fontFamily: 'Instrument Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary', textTransform: 'uppercase' }}>
        {selectedGroup?.name ?? 'Group'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Showing everything this group spent, across all members — not just your share. Switch back to “My spending” for change insights and budgets.
      </Typography>
    </Box>
  ) : (
    <Box sx={{ pt: 1, pb: 2 }}>
      <Typography sx={{ mb: 1.5, fontFamily: 'Instrument Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary', textTransform: 'uppercase' }}>
        WHAT CHANGED
      </Typography>
      <WhatChangedRail
        userId={user}
        year={year}
        month={isYearMode ? undefined : month}
        onAsk={setAskInsight}
        hasExpenses={periodData.total_expenses > 0 || periodData.category_totals.length > 0}
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
          budgetsByCategory={isYearMode ? undefined : budgetsByCategory}
        />

        {/* Design review (2026-09): the Sankey visualizes the exact same category_totals data
            as the spectrum right above it, stacked directly beneath — "multiple visualizations
            of the same small dataset add weight without insight." Collapsed by default; the
            spectrum already answers "what did I spend on," so the flow view is now an
            on-demand alternate look rather than always-rendered duplication. */}
        <Box sx={{ mt: 2, mb: showFlow ? 4 : 2 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => setShowFlow((v) => !v)}
            sx={{ color: 'text.secondary', px: 0 }}
          >
            {showFlow ? 'Hide the money flow' : 'See the money flow'}
          </Button>
          {showFlow && (
            <MoneyFlowSankey
              totalExpenses={periodData.total_expenses}
              categoryTotals={periodData.category_totals}
              details={periodData.category_expense_details || {}}
            />
          )}
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
          <IconButton size="small" onClick={handleYearMonthClick} aria-label="Choose month or year" sx={{ p: 0.25, color: 'text.secondary' }}>
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
          {/* TS-TAG-111 — scopes the breakdown below to expenses carrying any of the selected
              tags (OR semantics), AND'd against the month/year and Include-group-shares filters
              already on this page. Only the Overview tab gets this: Items/Merchants read from a
              separate pre-aggregated pipeline with no tag_ids support (PRD §10.4 only covers
              /analysis and /expenses). Hidden for a group's own total (2026-09 clarification):
              a tag is private to whoever applied it (TS-TAG-103), so "filter by my tags"
              doesn't mean anything against a group-wide total that isn't scoped to me. */}
          {tagsEnabled && !groupId && (
            <TagFilterSelect value={tagFilterIds} onChange={setTagFilterIds} />
          )}

          {groupsEnabled && groups.length > 0 && (
            <TextField
              select
              size="small"
              label="Analyse"
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                // The tag filter control is hidden for a group total (tags are private to
                // whoever applied them, so they don't mean anything against a group-wide
                // number) — clear it too, or a filter picked earlier would keep silently
                // narrowing the group's total with no visible control left to explain why.
                if (e.target.value) setTagFilterIds([]);
              }}
              // '' is a real choice ("My spending"), not "nothing picked" — show it as the value.
              SelectProps={{ displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">My spending</MenuItem>
              {groups.map((g) => (
                <MenuItem key={g.group_id} value={g.group_id}>{g.name} (whole group)</MenuItem>
              ))}
            </TextField>
          )}

          {/* TrackSpense v3 Prototype's one proposed Analysis addition — whether group shares
              count at all in the breakdowns below, not a spend-interpretation lens (see the
              component doc comment above for why this is a different question from that one).
              Irrelevant while a single group is being analysed, so hidden then. */}
          {!groupId && (
            <FormControlLabel
              control={<Switch size="small" checked={includeGroups} onChange={(e) => setIncludeGroups(e.target.checked)} />}
              label={<Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 12.5, color: 'text.secondary' }}>Include group shares</Typography>}
              sx={{ mr: 0 }}
            />
          )}

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

      {tagScopedTotals}

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
