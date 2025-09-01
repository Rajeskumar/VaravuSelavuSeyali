import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, TextField, Checkbox, FormControlLabel, Grid, Alert } from '@mui/material';
import { getRecurringDue, confirmRecurring, DueOccurrenceDTO } from '../../api/recurring';

interface ItemState {
  selected: boolean;
  cost: number;
}

const RecurringPrompt: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Record<string, ItemState>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [due, setDue] = React.useState<DueOccurrenceDTO[] | null>(null);
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  React.useEffect(() => {
    if (!user) return;
    // Only prompt once per session
    const sessionKey = `vs_recurring_prompted_${user}`;
    if (sessionStorage.getItem(sessionKey)) return;
    (async () => {
      try {
        const todayISO = new Date().toISOString().split('T')[0];
        const due = await getRecurringDue(todayISO);
        if (due.length > 0) {
          const state: Record<string, ItemState> = {};
          due.forEach(d => {
            const key = `${d.template_id}__${d.date_iso}`;
            state[key] = { selected: true, cost: d.suggested_cost };
          });
          setItems(state);
          setOpen(true);
          sessionStorage.setItem(sessionKey, '1');
        }
      } catch {
        // silently ignore failures
      }
    })();
  }, [user]);

  React.useEffect(() => {
    if (!open || !user) return;
    (async () => {
      try {
        const todayISO = new Date().toISOString().split('T')[0];
        const d = await getRecurringDue(todayISO);
        setDue(d);
      } catch {
        setDue([]);
      }
    })();
  }, [open, user]);
  if (!user || !open || !due || due.length === 0) return null;

  const onConfirm = async () => {
    setError(null);
    try {
      const toSend: { template_id: string; date_iso: string; cost: number }[] = [];
      for (const d of due) {
        const key = `${d.template_id}__${d.date_iso}`;
        const it = items[key];
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
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>Monthly recurring expenses due</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" sx={{ mb: 2 }}>
          The following recurring expenses are due. Review amounts and confirm to add them.
        </Typography>
        <Grid container columns={12} spacing={2}>
          {due.map(d => {
            const key = `${d.template_id}__${d.date_iso}`;
            const st = items[key];
            return (
              <Grid key={key} size={{ xs: 12 }} sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: theme => `1px dashed ${theme.palette.divider}`, pb: 1 }}>
                <FormControlLabel
                  control={<Checkbox checked={!!st?.selected} onChange={(e) => setItems(s => ({ ...s, [key]: { ...s[key], selected: e.target.checked } }))} />}
                  label=""
                />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle2">{d.description}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {d.category} • {(() => {
                      const [yy, mm, dd] = d.date_iso.split('-').map(Number);
                      const dt = new Date(yy, (mm || 1) - 1, dd || 1);
                      return dt.toLocaleDateString();
                    })()}
                  </Typography>
                </Box>
                <TextField
                  type="number"
                  label="Amount"
                  value={st?.cost ?? d.suggested_cost}
                  onChange={(e) => setItems(s => ({ ...s, [key]: { ...s[key], cost: parseFloat(e.target.value) || 0 } }))}
                  size="small"
                  sx={{ width: 140 }}
                />
              </Grid>
            );
          })}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>Skip</Button>
        <Button onClick={onConfirm} variant="contained">Confirm and Add</Button>
      </DialogActions>
    </Dialog>
  );
};

export default RecurringPrompt;
