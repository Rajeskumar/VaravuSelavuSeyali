import React from 'react';
import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { useQuery } from '@tanstack/react-query';
import { listMyCards } from '../../api/cards';
import { useCardCoachEnabled } from '../../hooks/useCardCoachEnabled';

interface CardPickerFieldProps {
  value: string | null;
  onChange: (cardId: string) => void;
}

/**
 * TS-CARD-114 — "which card did I use" picker for the add/edit expense flows. Only offers cards
 * the user has already added in the Cards tab (never the full catalog) and only renders at all
 * when there's at least one to pick from. Matches CategoryPickerField's click-a-field-to-open-a-
 * menu pattern — picking a card applies and closes immediately, no separate Save/Cancel step.
 *
 * Always shows a concrete card, auto-selecting the user's default held card the first time this
 * mounts with nothing chosen yet, rather than an empty/optional "unset" state — a blank "which
 * card" field just reads as an extra required decision on every expense; defaulting to the
 * card they'd reach for anyway and letting them override it is less friction, not more.
 */
const CardPickerField: React.FC<CardPickerFieldProps> = ({ value, onChange }) => {
  const { enabled: cardCoachEnabled } = useCardCoachEnabled();
  const { data: cards = [] } = useQuery({
    queryKey: ['cards', 'mine'],
    queryFn: listMyCards,
    enabled: cardCoachEnabled,
    staleTime: 30_000,
  });
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);

  const defaultCard = cards.find((c) => c.is_default) || cards[0];

  React.useEffect(() => {
    if (!value && defaultCard) onChange(defaultCard.card_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCard?.card_id]);

  if (!cardCoachEnabled || cards.length === 0) return null;

  const selected = cards.find((c) => c.card_id === value) || defaultCard;

  return (
    <Box>
      <Box
        onClick={(e) => setAnchor(e.currentTarget)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setAnchor(e.currentTarget as HTMLElement);
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          borderRadius: 1,
          cursor: 'pointer',
          border: '1px solid',
          borderColor: 'divider',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
            Card used
          </Typography>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {selected?.card_name || 'Select a card'}
          </Typography>
        </Box>
        <ChevronRightRoundedIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
      </Box>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {cards.map((c) => (
          <MenuItem
            key={c.id}
            selected={c.card_id === (value || defaultCard?.card_id)}
            onClick={() => {
              setAnchor(null);
              onChange(c.card_id);
            }}
          >
            {c.card_name}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default CardPickerField;
