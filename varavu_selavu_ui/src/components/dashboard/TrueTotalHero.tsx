import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import { useTheme } from '@mui/material/styles';
import { slate, typeScale } from '../../theme';
import { AnalysisGroupSummary, SpendBreakdown } from '../../api/analysis';

function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Sums personal spend + each group's `my_share` — the one number this hero shows.
 * `spend_breakdown.personal` is used (rather than `total_expenses`) so the personal
 * portion always matches the same "personal-only" number the group shares are added to.
 *
 * The "I Paid" lens this used to switch to was removed: what a member actually fronted
 * for a group isn't really "their spend" (most of it comes back via settle-up), and it
 * mixed a "money currently out of my account" concept into a page whose whole point is
 * one honest "what did I actually spend" number. `my_share` is that number; a member who
 * wants to track what they fronted has that in the group's own balance view already. */
export function computeMyExpensesTotal(personal: number, groupSummaries: AnalysisGroupSummary[]): number {
  return groupSummaries.reduce((sum, g) => sum + g.my_share, personal);
}

export interface MomDelta {
  amount: number;
  percent: number;
}

interface Props {
  personalTotal: number;
  spendBreakdown?: SpendBreakdown | null;
  groupSummaries: AnalysisGroupSummary[];
  groupsEnabled: boolean;
  periodLabel: string;
  /** Month-over-month delta (TS-DES-111) — null when there's no previous-month
   * data to compare against (e.g. a brand-new user's first month). */
  momDelta?: MomDelta | null;
}

/** The "True Total" hero (TS-DES-103): one display-face number (personal spend + my share of
 * every group) and a reconciled/pending status line. No longer has a lens switch — see
 * `computeMyExpensesTotal`'s comment for why "I Paid" was removed rather than kept as a toggle. */
const TrueTotalHero: React.FC<Props> = ({ personalTotal, groupSummaries, groupsEnabled, periodLabel, momDelta }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // "Ceremony" (RECONCILED badge) has no dedicated Slate hue — reuses the brand accent for a
  // distinct celebratory pop, since accent is otherwise reserved for interaction, not decoration.
  const accentColor = isDark ? slate.accentDark : slate.accent;
  const positiveColor = isDark ? slate.positiveDark : slate.positive;
  const negativeColor = isDark ? slate.negativeDark : slate.negative;

  const total = computeMyExpensesTotal(personalTotal, groupSummaries);
  const hasGroups = groupsEnabled && groupSummaries.length > 0;
  // "Settled" per the prototype means no outstanding balance either way.
  const allSettled = groupSummaries.every((g) => Math.abs(g.my_balance) < 0.005);
  const pendingCount = groupSummaries.filter((g) => Math.abs(g.my_balance) >= 0.005).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'center', md: 'flex-start' }, pt: 1, pb: 2 }}>
      <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>
        {periodLabel}
      </Typography>

      <Typography component="div" sx={{ ...typeScale.displayHero, color: 'text.primary' }}>
        {formatMoney(total)}
      </Typography>

      {momDelta && (
        <Typography
          variant="caption"
          sx={{ color: momDelta.amount > 0 ? negativeColor : momDelta.amount < 0 ? positiveColor : 'text.secondary', mt: 0.5, fontWeight: 600 }}
        >
          {momDelta.amount > 0 ? '+' : ''}{momDelta.percent.toFixed(0)}% vs last month
        </Typography>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5, minHeight: 20 }}>
        {hasGroups ? (
          allSettled ? (
            <>
              <CheckIcon sx={{ fontSize: 14, color: accentColor }} />
              <Typography sx={{ ...typeScale.label, color: accentColor }}>RECONCILED</Typography>
            </>
          ) : (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {pendingCount} group{pendingCount > 1 ? 's' : ''} still settling
            </Typography>
          )
        ) : null}
      </Box>
    </Box>
  );
};

export default TrueTotalHero;
