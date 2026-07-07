import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listRecurringTemplates, upsertRecurringTemplate, deleteRecurringTemplate, RecurringTemplateDTO } from '../api/recurring';
import { suggestCategory } from '../api/expenses';
import { Box, Typography, Button, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, FormControlLabel, Switch, Drawer, useTheme, IconButton, CircularProgress } from '@mui/material';
import AddIcon from '@mui/icons-material/AddRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import { motion } from 'framer-motion';

import { RecurringCard } from '../components/recurring/RecurringCard';
import { typeScale } from '../theme';

const RecurringPage: React.FC = () => {
  const theme = useTheme();
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
      setToast({ open: true, message: 'Template saved', severity: 'success' });
    },
    onError: () => {
      setToast({ open: true, message: 'Failed to save template', severity: 'error' });
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
      setToast({ open: true, message: 'Template deleted', severity: 'success' });
    },
    onError: () => setToast({ open: true, message: 'Failed to delete template', severity: 'error' }),
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
    // If not editing, id is blank, so we just don't pass it or let the backend generate it.
    // Actually the backend endpoint for upsert expects just the fields for create if we don't pass id?
    // Wait, the python backend upserts on matching (description, merchant_name, category) if id is omitted or missing.
    // If we have an id, we should pass it. But the UpsertRecurringTemplatePayload does not have `id`.
    // Let's pass what `UpsertRecurringTemplatePayload` expects.
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

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', pb: 8, pt: 2 }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography sx={{ ...typeScale.display, fontSize: '1.75rem' }}>
            Recurring
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
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 3 }}>
          {activeCount} active · ${activeCost.toFixed(2)}/mo
        </Typography>

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
             <CircularProgress />
          </Box>
        )}
        
        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(error as Error)?.message || 'Failed to load templates'}
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
            />
          ))}
          {templates.length === 0 && !isLoading && !isError && (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="body1" color="text.secondary">
                No recurring expenses set up yet.
              </Typography>
            </Box>
          )}
        </Box>
      </motion.div>

      {/* Add/Edit Form Drawer (Bottom Sheet) */}
      <Drawer
        anchor="bottom"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxWidth: 600,
            margin: '0 auto',
            width: '100%',
            maxHeight: '90vh',
          },
        }}
      >
        <Box sx={{ px: 3, pt: 2, pb: 4 }}>
          <Box sx={{ width: 40, height: 4, bgcolor: 'divider', borderRadius: 2, mx: 'auto', mb: 3 }} />
          
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Typography sx={{ fontFamily: 'Inter', fontSize: 18, fontWeight: 700, color: 'text.primary' }}>
              {editing ? 'Edit Template' : 'Add Template'}
            </Typography>
            <IconButton onClick={() => setFormOpen(false)} sx={{ mt: -1, mr: -1, color: 'text.secondary' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Description" fullWidth value={form.description} onChange={e => {
                const val = e.target.value;
                setForm(f => ({ ...f, description: val }));
                scheduleFetch(val);
              }} onBlur={() => scheduleFetch(form.description)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Category" fullWidth value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Merchant" fullWidth value={form.merchant_name} onChange={e => setForm(f => ({ ...f, merchant_name: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Day of month" type="number" fullWidth value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: Math.max(1, Math.min(31, parseInt(e.target.value || '1', 10))) }))} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Cost/mo" type="number" fullWidth value={form.default_cost} onChange={e => setForm(f => ({ ...f, default_cost: parseFloat(e.target.value) || 0 }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Start date" type="date" fullWidth value={form.start_date_iso} onChange={e => setForm(f => ({ ...f, start_date_iso: e.target.value }))} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={<Switch checked={form.status === 'Paused'} onChange={e => setForm(f => ({ ...f, status: e.target.checked ? 'Paused' : 'Active' }))} />}
                label={form.status === 'Paused' ? 'Paused' : 'Active'}
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
            Save Template
          </Button>
        </Box>
      </Drawer>

      {/* Delete Confirm Dialog */}
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle sx={{ fontFamily: 'Inter', fontWeight: 700 }}>Delete template?</DialogTitle>
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

export default RecurringPage;
