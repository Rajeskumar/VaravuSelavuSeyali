import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listRecurringTemplates, upsertRecurringTemplate, deleteRecurringTemplate, executeRecurringNow, RecurringTemplateDTO } from '../../api/recurring';
import { suggestCategory } from '../../api/expenses';
import { Box, Typography, Button, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, FormControlLabel, Switch, CircularProgress } from '@mui/material';
import AddIcon from '@mui/icons-material/AddRounded';
import FormSheet from '../common/FormSheet';
import EmptyState from '../common/EmptyState';

import { RecurringCard } from '../recurring/RecurringCard';
import { findMainCategory } from './AddExpenseForm';
import CategoryPickerField from './CategoryPickerField';

/**
 * TS-DES-204 — Recurring, migrated from the standalone `RecurringPage.tsx` (now deleted) into a
 * sub-tab of `ExpensesPage`. Content and behavior unchanged (`RecurringCard`'s pause/resume
 * toggle and "Run now" action were already built, not new to this ticket) — only the host
 * changed, from a page with its own title/route to a tab pane inside `ExpensesPage`'s
 * `SubTabBar`, so the "Recurring" page-title heading is dropped (the tab label already says it).
 */
const RecurringTab: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['recurring-templates'],
    queryFn: () => listRecurringTemplates(),
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    id: '',
    description: '',
    category: '',
    merchant_name: '',
    day_of_month: new Date().getDate(),
    default_cost: 0,
    start_date_iso: new Date().toISOString().split('T')[0],
    status: 'Active',
  });

  const [editing, setEditing] = React.useState<boolean>(false);
  const typingRef = React.useRef<NodeJS.Timeout | null>(null);

  const scheduleFetch = (desc: string) => {
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = setTimeout(async () => {
      if (!desc.trim()) return;
      try {
        const res = await suggestCategory(desc.trim());
        setForm(f => ({
          ...f,
          category: f.category || res.subcategory,
          merchant_name: f.merchant_name || res.merchant_name || '',
        }));
      } catch {
        // ignore errors
      }
    }, 1500);
  };

  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<RecurringTemplateDTO | null>(null);

  const saveMut = useMutation({
    mutationFn: (payload: any) => upsertRecurringTemplate(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-templates'] });
      setFormOpen(false);
      setToast({ open: true, message: 'Recurring expense saved', severity: 'success' });
    },
    onError: () => {
      setToast({ open: true, message: 'Failed to save recurring expense', severity: 'error' });
    }
  });

  const toggleMut = useMutation({
    mutationFn: (payload: any) => upsertRecurringTemplate(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-templates'] });
    },
    onError: () => {
      setToast({ open: true, message: 'Failed to update status', severity: 'error' });
    }
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteRecurringTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-templates'] });
      setToast({ open: true, message: 'Recurring expense deleted', severity: 'success' });
    },
    onError: () => setToast({ open: true, message: 'Failed to delete recurring expense', severity: 'error' }),
  });

  const templates = data || [];
  const activeCount = templates.filter(t => t.status === 'Active').length;
  const activeCost = templates.filter(t => t.status === 'Active').reduce((sum, t) => sum + t.default_cost, 0);

  const handleAddClick = () => {
    setEditing(false);
    setForm({
      id: '',
      description: '',
      category: '',
      merchant_name: '',
      day_of_month: new Date().getDate(),
      default_cost: 0,
      start_date_iso: new Date().toISOString().split('T')[0],
      status: 'Active',
    });
    setFormOpen(true);
  };

  const handleEditClick = (t: RecurringTemplateDTO) => {
    setEditing(true);
    setForm({
      id: t.id,
      description: t.description,
      category: t.category,
      merchant_name: t.merchant_name || '',
      day_of_month: t.day_of_month,
      default_cost: t.default_cost,
      start_date_iso: t.start_date_iso,
      status: t.status || 'Active',
    });
    setFormOpen(true);
  };

  const handleFormSubmit = () => {
    saveMut.mutate({
      description: form.description,
      category: form.category,
      merchant_name: form.merchant_name,
      day_of_month: form.day_of_month,
      default_cost: form.default_cost,
      start_date_iso: form.start_date_iso,
      status: form.status,
    });
  };

  const handleToggle = (item: RecurringTemplateDTO, newStatus: string) => {
    toggleMut.mutate({
      description: item.description,
      category: item.category,
      merchant_name: item.merchant_name,
      day_of_month: item.day_of_month,
      default_cost: item.default_cost,
      start_date_iso: item.start_date_iso,
      status: newStatus,
    });
  };

  const handleRunNow = async (item: RecurringTemplateDTO) => {
    try {
      await executeRecurringNow(item.id, item.default_cost);
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['all-group-expenses'] });
      setToast({ open: true, message: 'Recurring expense logged', severity: 'success' });
    } catch {
      setToast({ open: true, message: 'Failed to run expense', severity: 'error' });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          {activeCount} active · ${activeCost.toFixed(2)}/mo
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
          sx={{ borderRadius: 999, fontWeight: 600 }}
        >
          Add
        </Button>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error)?.message || 'Failed to load recurring expenses'}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {templates.map(item => (
          <RecurringCard
            key={item.id}
            item={item}
            onToggle={handleToggle}
            onEdit={handleEditClick}
            onDelete={(t) => { setPendingDelete(t); setConfirmDeleteOpen(true); }}
            onRunNow={handleRunNow}
          />
        ))}
        {templates.length === 0 && !isLoading && !isError && (
          <EmptyState
            title="No recurring expenses yet"
            description="Rent, subscriptions, anything that repeats — set it once and TrackSpense prompts you to log it each month."
            actionLabel="Add recurring expense"
            onAction={handleAddClick}
          />
        )}
      </Box>

      {/* Desktop dialog / mobile sheet (UI-10). "Template" is what the backend calls these;
          to the user it's just a recurring expense (UI-12). */}
      <FormSheet open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit recurring expense' : 'Add recurring expense'}>
        <Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Description" fullWidth value={form.description} onChange={e => {
                const val = e.target.value;
                setForm(f => ({ ...f, description: val }));
                scheduleFetch(val);
              }} onBlur={() => scheduleFetch(form.description)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <CategoryPickerField
                mainCategory={findMainCategory(form.category)}
                subcategory={form.category}
                onChange={(_main, sub) => setForm(f => ({ ...f, category: sub }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Merchant" fullWidth value={form.merchant_name} onChange={e => setForm(f => ({ ...f, merchant_name: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Day of month" type="number" fullWidth value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: Math.max(1, Math.min(31, parseInt(e.target.value || '1', 10))) }))} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Monthly amount" type="number" fullWidth value={form.default_cost} onChange={e => setForm(f => ({ ...f, default_cost: parseFloat(e.target.value) || 0 }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Start date" type="date" fullWidth value={form.start_date_iso} onChange={e => setForm(f => ({ ...f, start_date_iso: e.target.value }))} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={<Switch checked={form.status === 'Active'} onChange={e => setForm(f => ({ ...f, status: e.target.checked ? 'Active' : 'Paused' }))} />}
                label={form.status === 'Active' ? 'Active' : 'Paused'}
              />
            </Grid>
          </Grid>

          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={handleFormSubmit}
            disabled={saveMut.isPending || !form.description || !form.category || form.default_cost <= 0}
            sx={{ mt: 4, py: 1.5, fontSize: 15, fontWeight: 600, borderRadius: 20 }}
          >
            Save recurring expense
          </Button>
        </Box>
      </FormSheet>

      {/* Delete Confirm Dialog */}
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle sx={{ fontFamily: 'Instrument Sans', fontWeight: 700 }}>Delete template?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will stop future prompts for this recurring expense.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} sx={{ fontWeight: 600 }}>Cancel</Button>
          <Button color="error" variant="contained"
            onClick={() => {
              const id = pendingDelete?.id;
              setConfirmDeleteOpen(false);
              if (id) delMut.mutate(id);
            }}
            sx={{ fontWeight: 600, borderRadius: 999 }}
          >
            Delete
          </Button>
        </DialogActions>
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

export default RecurringTab;
