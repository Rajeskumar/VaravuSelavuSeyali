import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button, TextField,
  IconButton, CircularProgress, Alert, Link as MuiLink, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseRounded';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { getCardCatalogDetail, fileCardCorrection } from '../../api/cards';

interface Props {
  cardId: string | null;
  onClose: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/**
 * TS-CARD-110/§9.4 — card detail view. The "Source: [issuer link] · Verified [date]" line and
 * "Report incorrect info" affordance are a hard requirement per the spec, not a nice-to-have:
 * the whole feature's credibility rests on never overstating confidence in curated data.
 */
const CardDetailDialog: React.FC<Props> = ({ cardId, onClose }) => {
  const [reporting, setReporting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [filed, setFiled] = React.useState(false);

  const { data: card, isLoading } = useQuery({
    queryKey: ['card-catalog-detail', cardId],
    queryFn: () => getCardCatalogDetail(cardId as string),
    enabled: !!cardId,
  });

  const reportMut = useMutation({
    mutationFn: () => fileCardCorrection(cardId as string, note.trim()),
    onSuccess: () => {
      setFiled(true);
      setReporting(false);
      setNote('');
    },
  });

  const handleClose = () => {
    setReporting(false);
    setNote('');
    setFiled(false);
    onClose();
  };

  return (
    <Dialog open={!!cardId} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{card ? `${card.issuer} ${card.card_name}` : 'Card detail'}</span>
        <IconButton size="small" onClick={handleClose} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {card && (
          <>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1.5 }}>
              {card.reward_type}
              {card.points_currency_name ? ` · ${card.points_currency_name}` : ''}
              {card.annual_fee > 0 ? ` · $${card.annual_fee.toFixed(0)}/yr` : ' · no annual fee'}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
              {card.earning_rules.map((r) => (
                <Typography key={r.id} sx={{ fontSize: 13 }}>
                  {r.multiplier}x/% — {r.category_id}
                  {r.cap_amount ? ` (up to $${r.cap_amount.toLocaleString()}/${r.cap_period})` : ''}
                </Typography>
              ))}
              {card.earning_rules.length === 0 && (
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No earning rules on file.</Typography>
              )}
            </Box>

            <Divider sx={{ my: 1.5 }} />

            <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
              Source:{' '}
              <MuiLink href={card.source_url} target="_blank" rel="noopener noreferrer">
                {card.issuer} rates & terms
              </MuiLink>
              {' · '}Verified {formatDate(card.last_verified_at)}
            </Typography>

            {filed && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Thanks — this has been flagged for manual review.
              </Alert>
            )}

            {!filed && !reporting && (
              <Button
                size="small"
                startIcon={<FlagOutlinedIcon fontSize="small" />}
                onClick={() => setReporting(true)}
                sx={{ mt: 2 }}
              >
                Report incorrect info
              </Button>
            )}

            {!filed && reporting && (
              <Box sx={{ mt: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                  placeholder="What looks wrong? e.g. multiplier changed, category missing…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!note.trim() || reportMut.isPending}
                    onClick={() => reportMut.mutate()}
                  >
                    Submit
                  </Button>
                  <Button size="small" onClick={() => setReporting(false)}>Cancel</Button>
                </Box>
                {reportMut.isError && (
                  <Alert severity="error" sx={{ mt: 1 }}>Failed to submit — try again.</Alert>
                )}
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CardDetailDialog;
