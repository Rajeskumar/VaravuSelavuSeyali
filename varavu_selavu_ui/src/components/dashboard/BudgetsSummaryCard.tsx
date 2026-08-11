import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/CloseRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { useNavigate } from 'react-router-dom';
import { BudgetDTO } from '../../api/budgets';
import { cerebro } from '../../theme';

const DISMISSED_KEY = 'vs_budgets_prompt_dismissed_v1';

interface BudgetsSummaryCardProps {
  budgets: BudgetDTO[];
}

const cardSx = {
  backgroundColor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: `${cerebro.radius.surface}px`,
  px: 2,
  py: 1.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
  mb: 3,
} as const;

/** PRD §6.1 — a compact card ("3 of 5 on track · 1 at risk") linking to the Budgets tab, or a
 * single dismissible "Set a budget" prompt for a user with none yet (no clutter otherwise). */
const BudgetsSummaryCard: React.FC<BudgetsSummaryCardProps> = ({ budgets }) => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return !!localStorage.getItem(DISMISSED_KEY);
    } catch {
      return false;
    }
  });

  const goToBudgets = () => navigate('/analysis?tab=budgets');

  if (budgets.length === 0) {
    if (dismissed) return null;
    return (
      <Box sx={cardSx}>
        <Box sx={{ cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={goToBudgets}>
          <Typography sx={{ fontWeight: 600, fontSize: 14, color: 'text.primary' }}>Set a budget</Typography>
          <Typography variant="caption" color="text.secondary">
            Get an early warning before you overspend a category.
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            try {
              localStorage.setItem(DISMISSED_KEY, '1');
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  const onTrack = budgets.filter((b) => b.status === 'on_track').length;
  const atRisk = budgets.filter((b) => b.status === 'at_risk' || b.status === 'over_pace').length;
  const exceeded = budgets.filter((b) => b.status === 'exceeded').length;
  const parts = [`${onTrack} of ${budgets.length} on track`];
  if (atRisk > 0) parts.push(`${atRisk} at risk`);
  if (exceeded > 0) parts.push(`${exceeded} over`);

  return (
    <Box sx={{ ...cardSx, cursor: 'pointer' }} onClick={goToBudgets}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, color: 'text.primary' }}>Budgets</Typography>
        <Typography variant="caption" color="text.secondary">{parts.join(' · ')}</Typography>
      </Box>
      <ChevronRightRoundedIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
    </Box>
  );
};

export default BudgetsSummaryCard;
