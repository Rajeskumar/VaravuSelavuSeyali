import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listRecurringTemplates, upsertRecurringTemplate, deleteRecurringTemplate, executeRecurringNow, RecurringTemplateDTO } from '../api/recurring';
import { Box, Typography, Card, CardContent, TextField, Button, Paper, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Snackbar, Alert, CircularProgress, Dialog } from '@mui/material';
import Grid from '@mui/material/Grid';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import PauseIcon from '@mui/icons-material/Pause';

const RecurringPage: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['recurring-templates'],
    queryFn: () => listRecurringTemplates(),
  });

  const [form, setForm] = React.useState<{
    description: string;
    category: string;
    day_of_month: number;
    default_cost: number;
    start_date_iso: string;
    status: 'active' | 'paused';
  }>({
    description: '',
    category: '',
    day_of_month: new Date().getDate(),
    default_cost: 0,
    start_date_iso: new Date().toISOString().split('T')[0],
    status: 'active',
  });

  const [editing, setEditing] = React.useState<RecurringTemplateDTO | null>(null);

  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<RecurringTemplateDTO | null>(null);
  const [executeOpen, setExecuteOpen] = React.useState(false);
  const [pendingExec, setPendingExec] = React.useState<RecurringTemplateDTO | null>(null);
  const [execAmount, setExecAmount] = React.useState<number>(0);
  const [executingId, setExecutingId] = React.useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: () => upsertRecurringTemplate(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-templates'] });
      setEditing(null);
      setEditing(null);
      setForm({ description: '', category: '', day_of_month: new Date().getDate(), default_cost: 0, start_date_iso: new Date().toISOString().split('T')[0], status: 'active' });
      setToast({ open: true, message: 'Template saved', severity: 'success' });
    },
    onError: () => {
      setToast({ open: true, message: 'Failed to save template', severity: 'error' });
    }
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteRecurringTemplate(id),
    onMutate: (id: string) => setDeletingId(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-templates'] });
      setToast({ open: true, message: 'Template deleted', severity: 'success' });
    },
    onError: () => setToast({ open: true, message: 'Failed to delete template', severity: 'error' }),
    onSettled: () => setDeletingId(null),
  });

  const togglePause = useMutation({
    mutationFn: (t: RecurringTemplateDTO) => upsertRecurringTemplate({
      description: t.description,
      category: t.category,
      day_of_month: t.day_of_month,
      default_cost: t.default_cost,
      start_date_iso: t.start_date_iso,
      status: t.status === 'active' ? 'paused' : 'active'
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-templates'] });
      setToast({ open: true, message: 'Template status updated', severity: 'success' });
    },
    onError: () => setToast({ open: true, message: 'Failed to update status', severity: 'error' }),
  });

  const templates = data || [];

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Recurring</Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>{editing ? 'Edit Template' : 'Add Template'}</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField label="Description" fullWidth value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField label="Category" fullWidth value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <TextField label="Day of month" type="number" fullWidth value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: Math.max(1, Math.min(31, parseInt(e.target.value || '1', 10))) }))} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <TextField label="Default cost" type="number" fullWidth value={form.default_cost} onChange={e => setForm(f => ({ ...f, default_cost: parseFloat(e.target.value) || 0 }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField label="Start date" type="date" fullWidth value={form.start_date_iso} onChange={e => setForm(f => ({ ...f, start_date_iso: e.target.value }))} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Button variant="contained" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.description || !form.category || form.default_cost <= 0}>Save</Button>
              {editing && (
                <Button sx={{ ml: 1 }} onClick={() => { setEditing(null); setForm({ description: '', category: '', day_of_month: new Date().getDate(), default_cost: 0, start_date_iso: new Date().toISOString().split('T')[0], status: 'active' }); }}>Cancel</Button>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Paper>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Day</TableCell>
              <TableCell>Default Cost</TableCell>
              <TableCell>Start</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last Processed</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7}>Loading...</TableCell></TableRow>
            )}
            {isError && (
              <TableRow><TableCell colSpan={7} style={{ color: 'red' }}>{(error as Error)?.message || 'Failed to load'}</TableCell></TableRow>
            )}
            {templates.map(t => (
              <TableRow key={t.id} hover>
                <TableCell>{t.description}</TableCell>
                <TableCell>{t.category}</TableCell>
                <TableCell>{t.day_of_month}</TableCell>
                <TableCell>${t.default_cost.toFixed(2)}</TableCell>
                <TableCell>{t.start_date_iso}</TableCell>
                <TableCell>
                  {t.status === 'paused' ? <Typography variant="caption" color="text.secondary">Paused</Typography> : <Typography variant="caption" color="success.main">Active</Typography>}
                </TableCell>
                <TableCell>{t.last_processed_iso || '-'}</TableCell>
                <TableCell align="right">
                  <IconButton onClick={() => togglePause.mutate(t)} title={t.status === 'paused' ? "Resume" : "Pause"}>
                    {t.status === 'paused' ? <PlayArrowIcon /> : <PauseIcon />}
                  </IconButton>
                  <IconButton onClick={() => { setEditing(t); setForm({ description: t.description, category: t.category, day_of_month: t.day_of_month, default_cost: t.default_cost, start_date_iso: t.start_date_iso, status: t.status || 'active' }); }}><EditIcon /></IconButton>
                  <IconButton onClick={() => { setPendingExec(t); setExecAmount(t.default_cost); setExecuteOpen(true); }} disabled={executingId === t.id}>
                    {executingId === t.id ? <CircularProgress size={18} /> : <PlayArrowIcon />}
                  </IconButton>
                  <IconButton onClick={() => { setPendingDelete(t); setConfirmOpen(true); }} disabled={deletingId === t.id}>
                    {deletingId === t.id ? <CircularProgress size={18} /> : <DeleteIcon />}
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {/* Execute Now dialog */}
      <Dialog open={executeOpen} onClose={() => setExecuteOpen(false)}>
        <Box sx={{ p: 3, minWidth: 340 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Add this month’s expense now?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This will create the expense immediately and mark this month as processed so it won’t be added again automatically.
          </Typography>
          <TextField
            label="Amount"
            type="number"
            value={execAmount}
            onChange={e => setExecAmount(parseFloat(e.target.value) || 0)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={() => setExecuteOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={async () => {
                if (!pendingExec) return;
                try {
                  setExecutingId(pendingExec.id);
                  const resp = await executeRecurringNow(pendingExec.id, execAmount);
                  qc.invalidateQueries({ queryKey: ['recurring-templates'] });
                  setToast({ open: true, message: resp.created ? 'Expense added and month marked processed' : 'Month marked processed (already added)', severity: 'success' });
                } catch (e) {
                  setToast({ open: true, message: 'Failed to execute template', severity: 'error' });
                } finally {
                  setExecutingId(null);
                  setExecuteOpen(false);
                }
              }}
            >
              Execute Now
            </Button>
          </Box>
        </Box>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <Box sx={{ p: 3, minWidth: 320 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Delete template?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This will stop future prompts for this recurring expense.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button color="error" variant="contained"
              onClick={() => {
                const id = pendingDelete?.id;
                setConfirmOpen(false);
                if (id) delMut.mutate(id);
              }}
            >
              Delete
            </Button>
          </Box>
        </Box>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast(t => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default RecurringPage;
