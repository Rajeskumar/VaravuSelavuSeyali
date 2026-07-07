import React from 'react';
import { Drawer, Box, Typography, TextField, Checkbox, IconButton, Button, Grid, Alert, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircleRounded';
import { getRecurringDue, confirmRecurring, DueOccurrenceDTO } from '../../api/recurring';
import { typeScale } from '../../theme';

interface ItemState {
  selected: boolean;
  cost: number;
}

const RecurringPrompt: React.FC = () => {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Record<string, ItemState>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [due, setDue] = React.useState<DueOccurrenceDTO[] | null>(null);
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  // Per-item individual confirm status
  const [confirmedIds, setConfirmedIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!user) return;
    // Only prompt once per session
    const sessionKey = `vs_recurring_prompted_${user}`;
    if (sessionStorage.getItem(sessionKey)) return;
    (async () => {
      try {
        const todayISO = new Date().toISOString().split('T')[0];
        const dueList = await getRecurringDue(todayISO);
        if (dueList.length > 0) {
          const state: Record<string, ItemState> = {};
          dueList.forEach(d => {
            const key = `${d.template_id}__${d.date_iso}`;
            state[key] = { selected: true, cost: d.suggested_cost };
          });
          setItems(state);
          setDue(dueList);
          setOpen(true);
          sessionStorage.setItem(sessionKey, '1');
        }
      } catch {
        // silently ignore failures
      }
    })();
  }, [user]);

  if (!user || !open || !due || due.length === 0) return null;

  const handleConfirmOne = (key: string) => {
    setConfirmedIds(prev => [...prev, key]);
    setItems(s => ({ ...s, [key]: { ...s[key], selected: true } }));
  };

  const onConfirm = async () => {
    setError(null);
    try {
      const toSend: { template_id: string; date_iso: string; cost: number }[] = [];
      for (const d of due) {
        const key = `${d.template_id}__${d.date_iso}`;
        const it = items[key];
        // Must be selected and confirmed (if confirmed manually or we just trust the selected flag)
        if (!it?.selected) continue;
        const cost = Number(it.cost) || 0;
        if (cost <= 0) continue;
        toSend.push({ template_id: d.template_id, date_iso: d.date_iso, cost });
      }
      if (toSend.length > 0) await confirmRecurring(toSend);
      setOpen(false);
    } catch (e) {
      setError('Failed to add one or more expenses. Please try again.');
    }
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => setOpen(false)}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxWidth: 600,
          margin: '0 auto',
          width: '100%',
          maxHeight: '85vh',
        },
      }}
    >
      <Box sx={{ px: 3, pt: 2, pb: 4 }}>
        <Box sx={{ width: 40, height: 4, bgcolor: 'divider', borderRadius: 2, mx: 'auto', mb: 3 }} />
        
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ fontFamily: 'Inter', fontSize: 18, fontWeight: 700, color: 'text.primary' }}>
            {due.length} recurring expenses are due
          </Typography>
          <IconButton onClick={() => setOpen(false)} sx={{ mt: -1, mr: -1, color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        
        <Typography sx={{ fontFamily: 'Inter', fontSize: 13, color: 'text.secondary', mb: 3 }}>
          Confirm to log them, or dismiss and handle them later — this won't block the app.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 4 }}>
          {due.map(d => {
            const key = `${d.template_id}__${d.date_iso}`;
            const st = items[key];
            const done = confirmedIds.includes(key);
            
            const [yy, mm, dd] = d.date_iso.split('-').map(Number);
            const dateStr = new Date(yy, (mm || 1) - 1, dd || 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            return (
              <Box
                key={key}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 1.5,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  opacity: done ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                  gap: 2
                }}
              >
                <Checkbox
                  checked={!!st?.selected}
                  onChange={(e) => setItems(s => ({ ...s, [key]: { ...s[key], selected: e.target.checked } }))}
                  sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 20 } }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.description}
                  </Typography>
                  <Typography sx={{ fontFamily: 'Inter', fontSize: 12, color: 'text.secondary' }}>
                    {d.category} · {dateStr}
                  </Typography>
                </Box>
                
                {done ? (
                   <Typography sx={{ ...typeScale.amount, color: 'text.primary', mr: 2 }}>
                     ${(st?.cost ?? 0).toFixed(2)}
                   </Typography>
                ) : (
                  <TextField
                    type="number"
                    value={st?.cost ?? d.suggested_cost}
                    onChange={(e) => setItems(s => ({ ...s, [key]: { ...s[key], cost: parseFloat(e.target.value) || 0 } }))}
                    size="small"
                    sx={{ width: 90, '& .MuiInputBase-input': { p: 1, ...typeScale.amount, fontSize: 14 } }}
                  />
                )}

                {done ? (
                  <CheckCircleIcon sx={{ color: theme.palette.success.main, fontSize: 20 }} />
                ) : (
                  <Button
                    onClick={() => handleConfirmOne(key)}
                    variant="outlined"
                    color="primary"
                    size="small"
                    sx={{
                      borderRadius: 999,
                      px: 2,
                      py: 0.5,
                      minWidth: 0,
                      fontWeight: 600,
                      fontSize: 12,
                      textTransform: 'none',
                    }}
                  >
                    Confirm
                  </Button>
                )}
              </Box>
            );
          })}
        </Box>

        <Button
          onClick={onConfirm}
          variant="contained"
          color="primary"
          fullWidth
          sx={{
            py: 1.5,
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 20
          }}
        >
          Confirm all selected
        </Button>
      </Box>
    </Drawer>
  );
};

export default RecurringPrompt;
