import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import { useTheme } from '@mui/material/styles';
import SegmentedTabs from '../common/SegmentedTabs';
import { reconcile, typeScale } from '../../theme';
import { AnalysisGroupSummary, SpendBreakdown } from '../../api/analysis';

export type TrueTotalLens = 'my_share' | 'i_paid' | 'group_total';

const LENS_OPTIONS: { value: TrueTotalLens; label: string }[] = [
  { value: 'my_share', label: 'My Share' },
  { value: 'i_paid', label: 'I Paid' },
  { value: 'group_total', label: 'Group Total' },
];

function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Sums personal spend + the requested per-group lens field across every group,
 * matching Dashboard.jsx's `computeLensTotal`. `spend_breakdown.personal` is used
 * (rather than `total_expenses`) so the personal portion always matches the same
 * "personal-only" number the lens's group figures are being added to. */
export function computeLensTotal(
  lens: TrueTotalLens,
  personal: number,
  groupSummaries: AnalysisGroupSummary[]
): number {
  return groupSummaries.reduce((sum, g) => sum + g[lens], personal);
}

export interface MomDelta {
  amount: number;
  percent: number;
}

interface Props {
  lens: TrueTotalLens;
  onLensChange: (lens: TrueTotalLens) => void;
  personalTotal: number;
  spendBreakdown?: SpendBreakdown | null;
  groupSummaries: AnalysisGroupSummary[];
  groupsEnabled: boolean;
  periodLabel: string;
  /** Month-over-month delta (TS-DES-111) — null when there's no previous-month
   * data to compare against (e.g. a brand-new user's first month). */
  momDelta?: MomDelta | null;
}

/** The "True Total + lens" hero (TS-DES-103): one display-face number, a
 * reconciled/pending status line, and the My Share/I Paid/Group Total lens that
 * re-scopes that same number. Reuses the shared `SegmentedTabs` control rather
 * than a bespoke lens switch. */
const TrueTotalHero: React.FC<Props> = ({ lens, onLensChange, personalTotal, groupSummaries, groupsEnabled, periodLabel, momDelta }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const goldColor = isDark ? reconcile.goldDark : reconcile.gold;
  const jadeColor = isDark ? reconcile.jadeDark : reconcile.jadeText;
  const emberColor = isDark ? reconcile.emberDark : reconcile.ember;

  const total = computeLensTotal(lens, personalTotal, groupSummaries);
  const hasGroups = groupsEnabled && groupSummaries.length > 0;
  // "Settled" per the prototype means no outstanding balance either way.
  const allSettled = groupSummaries.every((g) => Math.abs(g.my_balance) < 0.005);
  const pendingCount = groupSummaries.filter((g) => Math.abs(g.my_balance) >= 0.005).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 1, pb: 2 }}>
      <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>
        {periodLabel}
      </Typography>

      <Typography component="div" sx={{ ...typeScale.displayHero, color: 'text.primary' }}>
        {formatMoney(total)}
      </Typography>

      {momDelta && (
        <Typography
          variant="caption"
          sx={{ color: momDelta.amount > 0 ? emberColor : momDelta.amount < 0 ? jadeColor : 'text.secondary', mt: 0.5, fontWeight: 600 }}
        >
          {momDelta.amount > 0 ? '+' : ''}{momDelta.percent.toFixed(0)}% vs last month
        </Typography>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5, minHeight: 20 }}>
        {hasGroups ? (
          allSettled ? (
            <>
              <CheckIcon sx={{ fontSize: 14, color: goldColor }} />
              <Typography sx={{ ...typeScale.label, color: goldColor }}>RECONCILED</Typography>
            </>
          ) : (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {pendingCount} group{pendingCount > 1 ? 's' : ''} still settling
            </Typography>
          )
        ) : null}
      </Box>

      {hasGroups && (
        <Box sx={{ width: '100%', mt: 2.5 }}>
          <SegmentedTabs value={lens} onChange={onLensChange} options={LENS_OPTIONS} fullWidth ariaLabel="Dashboard total lens" />
        </Box>
      )}
    </Box>
  );
};

export default TrueTotalHero;
