import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, TextField, Chip, CircularProgress, Alert, IconButton, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import StarIcon from '@mui/icons-material/StarRounded';
import StarBorderIcon from '@mui/icons-material/StarBorderRounded';
import {
  listMyCards, addMyCard, removeMyCard, setMyDefaultCard, searchCardCatalog, getCardCoach,
  UserCardDTO, CardCatalogSummary, CardCoachCategoryDTO, CardCoachMerchantDTO,
} from '../../api/cards';
import CardDetailDialog from './CardDetailDialog';
import CustomCardForm from './CustomCardForm';

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

interface GapRowShape {
  actual_spend: number;
  actual_earned_estimate: number | null;
  held_card_used: string | null;
  optimal_in_wallet_card: string | null;
  optimal_in_wallet_earned_estimate: number | null;
  optimal_catalog_card: string | null;
  optimal_catalog_earned_estimate: number | null;
  cap_note: string | null;
  is_using_best_held_card: boolean;
}

/** Shared row shell for both category and merchant gap rows (CardCoachCategoryDTO/
 * CardCoachMerchantDTO) — same fields, just a different label (category name vs. merchant name). */
const GapCard: React.FC<{ label: string; row: GapRowShape }> = ({ label, row }) => {
  const gap = row.optimal_in_wallet_earned_estimate != null && row.actual_earned_estimate != null
    ? Math.max(row.optimal_in_wallet_earned_estimate - row.actual_earned_estimate, 0)
    : null;

  return (
    <Box sx={{ backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1.2, p: 2, mb: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{label}</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{formatMoney(row.actual_spend)} spent</Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
          Actual: {row.held_card_used ? `${row.held_card_used} earned ${formatMoney(row.actual_earned_estimate ?? 0)}` : 'no default card set'}
        </Typography>
        {row.optimal_in_wallet_card && (
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
            Best you hold: {row.optimal_in_wallet_card} — {formatMoney(row.optimal_in_wallet_earned_estimate ?? 0)}
          </Typography>
        )}
        {row.optimal_catalog_card && (
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
            Best in catalog: {row.optimal_catalog_card} — {formatMoney(row.optimal_catalog_earned_estimate ?? 0)}
          </Typography>
        )}
      </Box>

      {gap != null && gap > 0 && (
        row.is_using_best_held_card ? (
          <Chip
            size="small"
            color="warning"
            label={`${formatMoney(gap)} left on the table`}
            sx={{ mt: 1, fontWeight: 600 }}
          />
        ) : (
          <Chip
            size="small"
            color="info"
            label={`Switch to ${row.optimal_in_wallet_card} — save ${formatMoney(gap)}, you already own it`}
            sx={{ mt: 1, fontWeight: 600 }}
          />
        )
      )}
      {row.cap_note && (
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 1, fontStyle: 'italic' }}>
          {row.cap_note}
        </Typography>
      )}
    </Box>
  );
};

const HeldCardRow: React.FC<{ card: UserCardDTO; onRemove: () => void; onSetDefault: () => void; onOpenDetail: () => void; busy: boolean }> = ({ card, onRemove, onSetDefault, onOpenDetail, busy }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
    <Tooltip title={card.is_default ? 'Default card for "actual earned" estimates' : 'Set as default'}>
      <IconButton size="small" onClick={onSetDefault} disabled={busy || card.is_default} aria-label="Set default card">
        {card.is_default ? <StarIcon fontSize="small" color="warning" /> : <StarBorderIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
    <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpenDetail}>
      <Typography sx={{ fontWeight: 600, fontSize: 13.5 }} noWrap>{card.issuer} {card.card_name}</Typography>
    </Box>
    <IconButton size="small" onClick={onRemove} disabled={busy} aria-label="Remove card">
      <CloseIcon fontSize="small" />
    </IconButton>
  </Box>
);

/**
 * TS-CARD-107 — Analysis "Cards" tab. Empty state (no held cards) shows a search/add picker;
 * once at least one card is held it shows the held-card list plus CardRewardsEngine's
 * per-category actual-vs-optimal breakdown (spec §9.1). Mirrors BudgetsTab.tsx's shell/patterns.
 */
const CardsTab: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [detailCardId, setDetailCardId] = React.useState<string | null>(null);
  const [customFormOpen, setCustomFormOpen] = React.useState(false);

  const { data: myCards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['cards-mine'],
    queryFn: listMyCards,
  });

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['card-catalog-search', search],
    queryFn: () => searchCardCatalog(search || undefined),
    enabled: pickerOpen,
  });

  const now = new Date();
  const { data: coach, isLoading: coachLoading, isError: coachError } = useQuery({
    queryKey: ['card-coach', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => getCardCoach({ year: now.getFullYear(), month: now.getMonth() + 1 }),
    enabled: myCards.length > 0,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cards-mine'] });
    qc.invalidateQueries({ queryKey: ['card-coach'] });
  };

  const addMut = useMutation({
    mutationFn: (cardId: string) => addMyCard(cardId),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (userCardId: string) => removeMyCard(userCardId),
    onSuccess: invalidate,
  });
  const defaultMut = useMutation({
    mutationFn: (userCardId: string) => setMyDefaultCard(userCardId),
    onSuccess: invalidate,
  });

  const heldCardIds = new Set(myCards.map((c) => c.card_id));
  const busy = addMut.isPending || removeMut.isPending || defaultMut.isPending;

  const picker = (
    <Box sx={{ mt: pickerOpen ? 2 : 0 }}>
      {pickerOpen && (
        <>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by issuer or card name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            sx={{ mb: 1.5 }}
          />
          {searching && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          )}
          {!searching && searchResults.length === 0 && (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', textAlign: 'center', py: 2 }}>
              {search ? 'No matching cards in the catalog.' : 'Type to search the card catalog.'}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {searchResults.map((c: CardCatalogSummary) => (
              <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
                <Box sx={{ minWidth: 0, cursor: 'pointer' }} onClick={() => setDetailCardId(c.id)}>
                  <Typography sx={{ fontWeight: 600, fontSize: 13.5 }} noWrap>{c.issuer} {c.card_name}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                    {c.reward_type}{c.annual_fee > 0 ? ` · $${c.annual_fee.toFixed(0)}/yr` : ' · no annual fee'}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant={heldCardIds.has(c.id) ? 'outlined' : 'contained'}
                  disabled={heldCardIds.has(c.id) || addMut.isPending}
                  onClick={() => addMut.mutate(c.id)}
                >
                  {heldCardIds.has(c.id) ? 'Added' : 'Add'}
                </Button>
              </Box>
            ))}
          </Box>

          {!customFormOpen && (
            <Button size="small" sx={{ mt: 1.5 }} onClick={() => setCustomFormOpen(true)}>
              Can't find your card? Add your own
            </Button>
          )}
          {customFormOpen && (
            <CustomCardForm
              onDone={() => { setCustomFormOpen(false); setPickerOpen(false); }}
              onCancel={() => setCustomFormOpen(false)}
            />
          )}
        </>
      )}
    </Box>
  );

  if (cardsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (myCards.length === 0) {
    return (
      <Box>
        <Box sx={{ textAlign: 'center', py: pickerOpen ? 0 : 4 }}>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Add the cards you carry to see how they're performing.
          </Typography>
          {!pickerOpen && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setPickerOpen(true)} sx={{ borderRadius: 999, fontWeight: 600 }}>
              Add a card
            </Button>
          )}
        </Box>
        {picker}
        <CardDetailDialog cardId={detailCardId} onClose={() => setDetailCardId(null)} />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary' }}>Your cards</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setPickerOpen((o) => !o)}>
            Add another
          </Button>
        </Box>
        {myCards.map((c) => (
          <HeldCardRow
            key={c.id}
            card={c}
            busy={busy}
            onRemove={() => removeMut.mutate(c.id)}
            onSetDefault={() => defaultMut.mutate(c.id)}
            onOpenDetail={() => setDetailCardId(c.card_id)}
          />
        ))}
        {picker}
      </Box>

      <Box
        component="button"
        onClick={() => navigate(`/ask?q=${encodeURIComponent('Which card should I use for a purchase?')}`)}
        sx={{
          display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
          p: 0, mb: 2, cursor: 'pointer', font: 'inherit',
        }}
      >
        <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
          💬 Ask: which card should I use for a purchase? →
        </Typography>
      </Box>

      {coachLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {coachError && <Alert severity="error">Failed to load your reward breakdown.</Alert>}
      {coach && (
        <>
          {coach.total_estimated_gap > 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              You left an estimated {formatMoney(coach.total_estimated_gap)} in rewards on the table this month, using cards you already hold.
            </Alert>
          ) : (
            <Alert severity="success" sx={{ mb: 2 }}>
              You're using your best held card for every category with spend this month.
            </Alert>
          )}
          {coach.by_category.length === 0 && (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', textAlign: 'center', py: 3 }}>
              No categorized spend yet this month.
            </Typography>
          )}
          {coach.by_category.map((row) => (
            <GapCard key={row.category} label={row.category} row={row} />
          ))}

          {coach.by_merchant.length > 0 && (
            <>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', mt: 3, mb: 1 }}>
                By merchant
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mb: 1.5 }}>
                A merchant-specific rate always beats a card's general category rate — shown here separately since it's already included in the category totals above.
              </Typography>
              {coach.by_merchant.map((row) => (
                <GapCard key={row.merchant} label={row.merchant} row={row} />
              ))}
            </>
          )}
        </>
      )}

      <CardDetailDialog cardId={detailCardId} onClose={() => setDetailCardId(null)} />
    </Box>
  );
};

export default CardsTab;
