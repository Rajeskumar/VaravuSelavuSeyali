import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { typeScale } from '../../theme';
import { AnalysisGroupSummary, SpendBreakdown } from '../../api/analysis';
import SegmentedTabs from '../common/SegmentedTabs';

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

/** "I Paid" total (opt-in lens, see `lens` prop below): personal spend + what the user
 * actually fronted in each group (`i_paid`), vs. `computeMyExpensesTotal`'s "my share" of it. */
export function computeIPaidTotal(personal: number, groupSummaries: AnalysisGroupSummary[]): number {
  return groupSummaries.reduce((sum, g) => sum + g.i_paid, personal);
}

/** "Net with people" (TrackSpense v3 design): sum of `my_balance` across every group — positive
 * means people owe the user overall, negative means the user owes overall. Reuses data the
 * caller already fetched via `getAnalysis` (group_summaries), no separate API call needed. */
export function computeNetWithPeople(groupSummaries: AnalysisGroupSummary[]): number {
  return groupSummaries.reduce((sum, g) => sum + g.my_balance, 0);
}

export interface MomDelta {
  amount: number;
  percent: number;
}

export type SpendLens = 'share' | 'paid';

interface Props {
  personalTotal: number;
  spendBreakdown?: SpendBreakdown | null;
  groupSummaries: AnalysisGroupSummary[];
  groupsEnabled: boolean;
  periodLabel: string;
  /** Month-over-month delta (TS-DES-111) — null when there's no previous-month
   * data to compare against (e.g. a brand-new user's first month). */
  momDelta?: MomDelta | null;
  /**
   * "My expenses / I paid" toggle (TrackSpense v3 design — both breakpoints now). Undefined
   * keeps the single always-"my share" total `computeMyExpensesTotal`'s doc comment explains;
   * every current call site (`DashboardPage.tsx`) passes it, so this is effectively always on,
   * but left optional so a caller can still opt out without a separate code path.
   */
  lens?: SpendLens;
  onLensChange?: (lens: SpendLens) => void;
}

/** The "True Total" hero (TS-DES-103, extended by the TrackSpense v3 design): a display-face
 * spend number (personal spend + my share of every group, or "I paid" via the lens) alongside a
 * second "Net with people" figure (sum of every group's `my_balance`) — side-by-side on desktop,
 * stacked on mobile — plus a reconciled/pending status line. */
const TrueTotalHero: React.FC<Props> = ({ personalTotal, groupSummaries, groupsEnabled, periodLabel, momDelta, lens, onLensChange }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  // "Ceremony" (RECONCILED badge) has no dedicated CerebroOS hue — reuses the brand accent for a
  // distinct celebratory pop, since accent is otherwise reserved for interaction, not decoration.
  const accentColor = theme.palette.primary.main;
  const positiveColor = theme.palette.success.main;
  const negativeColor = theme.palette.error.main;

  const total = lens === 'paid'
    ? computeIPaidTotal(personalTotal, groupSummaries)
    : computeMyExpensesTotal(personalTotal, groupSummaries);
  const hasGroups = groupsEnabled && groupSummaries.length > 0;
  // "Settled" per the prototype means no outstanding balance either way.
  const allSettled = groupSummaries.every((g) => Math.abs(g.my_balance) < 0.005);
  const pendingCount = groupSummaries.filter((g) => Math.abs(g.my_balance) >= 0.005).length;

  const netWithPeople = computeNetWithPeople(groupSummaries);
  const netColor = netWithPeople > 0 ? positiveColor : netWithPeople < 0 ? negativeColor : theme.palette.text.secondary;
  const netAmountText = netWithPeople === 0 ? '$0.00' : (netWithPeople > 0 ? '+' : '') + formatMoney(netWithPeople);
  const netSubText = netWithPeople === 0 ? 'all settled up' : netWithPeople > 0 ? "you're owed" : 'you owe';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'center', md: 'flex-start' }, pt: 1, pb: 2, width: '100%' }}>
      <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>
        {periodLabel}
      </Typography>

      {lens && onLensChange && hasGroups && (
        <SegmentedTabs<SpendLens>
          value={lens}
          onChange={onLensChange}
          size="small"
          ariaLabel="My expenses or I paid"
          options={[
            { value: 'share', label: 'My expenses' },
            { value: 'paid', label: 'I paid' },
          ]}
        />
      )}

      {/* Desktop: spend + "Net with people" side by side (TrackSpense v3 Prototype's 2-column
          grid). Mobile: stacked, "Net with people" as a bordered-top row below spend (the
          equivalent row from the Mobile design's hero card). */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: hasGroups ? '1fr 1px 1fr' : '1fr' },
          columnGap: 3,
          alignItems: 'center',
          width: '100%',
          mt: lens ? 1 : 0,
        }}
      >
        <Box>
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
        </Box>

        {hasGroups && (
          <>
            <Box sx={{ display: { xs: 'none', md: 'block' }, width: '1px', height: 64, bgcolor: 'divider' }} />
            <Box
              onClick={() => navigate('/groups?tab=people')}
              sx={{
                cursor: 'pointer',
                width: '100%',
                mt: { xs: 2, md: 0 },
                pt: { xs: 2, md: 0 },
                borderTop: { xs: '1px solid', md: 'none' },
                borderColor: 'divider',
              }}
            >
              <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>Net with people</Typography>
              <Typography component="div" sx={{ ...typeScale.display, fontSize: { xs: 26, md: 32 }, color: netColor }}>
                {netAmountText}
              </Typography>
              <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                {netSubText} →
              </Typography>
            </Box>
          </>
        )}
      </Box>

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
