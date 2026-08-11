import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme, Theme } from '@mui/material/styles';
import { tabularNums } from '../../theme';
import { BudgetStatus } from '../../api/budgets';

export const STATUS_LABEL: Record<BudgetStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  over_pace: 'Over pace',
  exceeded: 'Over budget',
};

export function statusColor(theme: Theme, status: BudgetStatus): string {
  switch (status) {
    case 'on_track':
      return theme.palette.success.main;
    case 'at_risk':
      return theme.palette.warning.main;
    case 'over_pace':
    case 'exceeded':
      return theme.palette.error.main;
    default:
      return theme.palette.text.secondary;
  }
}

export function formatBudgetMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

interface BudgetProgressBarProps {
  spent: number;
  amount: number;
  status: BudgetStatus;
  /** Card contexts want the "$spent of $amount · status" text row above the bar; compact
   * inline-row contexts (Dashboard "Where it went", Analysis category rows) render their own
   * adjacent label and just want the bar itself. */
  showLabel?: boolean;
}

/** Overflow-safe budget progress bar (PRD §6.5): fill is capped at 100% width with an explicit
 * "over by $X" text tag rather than letting the bar itself overflow its container. Status is
 * always spelled out in text, never color-only, per the accessibility requirement. */
const BudgetProgressBar: React.FC<BudgetProgressBarProps> = ({ spent, amount, status, showLabel = true }) => {
  const theme = useTheme();
  const color = statusColor(theme, status);
  const pct = amount > 0 ? Math.max(0, Math.min(100, (spent / amount) * 100)) : 0;
  const over = spent - amount;

  return (
    <Box>
      {showLabel && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', ...tabularNums }}>
            {formatBudgetMoney(spent)} of {formatBudgetMoney(amount)}
          </Typography>
          <Typography variant="caption" sx={{ color, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {STATUS_LABEL[status]}
            {over > 0 ? ` · over by ${formatBudgetMoney(over)}` : ''}
          </Typography>
        </Box>
      )}
      <Box sx={{ width: '100%', height: 6, borderRadius: 999, backgroundColor: 'divider', overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', backgroundColor: color, transition: 'width 0.3s ease' }} />
      </Box>
    </Box>
  );
};

export default BudgetProgressBar;
