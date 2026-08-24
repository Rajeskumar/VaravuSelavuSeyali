import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCardCoach, CardCoachCategoryDTO } from '../../api/cards';
import { cerebro } from '../../theme';

/** The single category with the biggest actionable "switch to a card you already hold" gap, or
 * null if none exists (either no gaps, or the only gaps need a card not in the wallet). Mirrors
 * CardsTab.tsx's GapCard gap computation. */
function biggestSwitchOpportunity(byCategory: CardCoachCategoryDTO[]): CardCoachCategoryDTO | null {
  let best: CardCoachCategoryDTO | null = null;
  let bestGap = 0;
  for (const row of byCategory) {
    if (row.is_using_best_held_card) continue;
    if (row.optimal_in_wallet_earned_estimate == null || row.actual_earned_estimate == null) continue;
    const gap = row.optimal_in_wallet_earned_estimate - row.actual_earned_estimate;
    if (gap > bestGap) {
      bestGap = gap;
      best = row;
    }
  }
  return best;
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

/**
 * TS-CARD-108 — dashboard insight card, spec §9.2: "You left an estimated $X in rewards on the
 * table this month → Ask about it." Only renders when there's a real gap to report (a default
 * card is set AND a better held card exists for some category) — no empty-state nudge here,
 * the Cards tab itself already owns onboarding (spec §9.1). Same conditional-card shell as
 * BudgetsSummaryCard.tsx.
 */
const CardCoachSummaryCard: React.FC = () => {
  const navigate = useNavigate();
  const now = React.useMemo(() => new Date(), []);
  const { data: coach } = useQuery({
    queryKey: ['card-coach', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => getCardCoach({ year: now.getFullYear(), month: now.getMonth() + 1 }),
  });

  if (!coach || coach.total_estimated_gap <= 0) return null;

  const switchRow = biggestSwitchOpportunity(coach.by_category);
  const headline = switchRow
    ? `Switch to ${switchRow.optimal_in_wallet_card} for ${switchRow.category} to earn $${(switchRow.optimal_in_wallet_earned_estimate! - switchRow.actual_earned_estimate!).toFixed(2)} more this month`
    : `You left an estimated $${coach.total_estimated_gap.toFixed(2)} in rewards on the table this month`;

  const goToCards = () => navigate('/analysis?tab=cards');
  const askAboutIt = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/ask?q=${encodeURIComponent('How much would I have earned this month with a different card, by category?')}`);
  };

  return (
    <Box sx={{ ...cardSx, cursor: 'pointer' }} onClick={goToCards}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, color: 'text.primary' }}>
          {headline}
        </Typography>
        <Box component="button" onClick={askAboutIt} sx={{ background: 'none', border: 'none', p: 0, cursor: 'pointer', font: 'inherit' }}>
          <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
            Ask about it →
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default CardCoachSummaryCard;
