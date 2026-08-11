import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Grid, FormControlLabel, Switch, Drawer, IconButton, CircularProgress, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import {
  listBudgets, createBudget, deleteBudget, getBudgetSuggestions,
  BudgetDTO, BudgetTargetType, BudgetScope,
} from '../../api/budgets';
import { useGroupsEnabled } from '../../hooks/useGroupsEnabled';
import { findMainCategory } from '../expenses/AddExpenseForm';
import CategoryPickerField from '../expenses/CategoryPickerField';
import SegmentedTabs from '../common/SegmentedTabs';
import BudgetCard from '../budgets/BudgetCard';

const THRESHOLD_OPTIONS = [50, 80, 90, 100, 110];
const DEFAULT_THRESHOLDS = [80, 100];

interface BudgetFormState {
  id: string | null;
  target_type: BudgetTargetType;
  category: string;
  amount: string;
  scope: BudgetScope;
  rollover: boolean;
  alert_thresholds: number[];
}

const emptyForm = (): BudgetFormState => ({
  id: null,
  target_type: 'category',
  category: '',
  amount: '',
  scope: 'personal',
  rollover: false,
  alert_thresholds: [...DEFAULT_THRESHOLDS],
});

function summarize(budgets: BudgetDTO[]): string {
  if (budgets.length === 0) return 'No budgets yet';
  const onTrack = budgets.filter((b) => b.status === 'on_track').length;
  const atRisk = budgets.filter((b) => b.status === 'at_risk' || b.status === 'over_pace').length;
  const exceeded = budgets.filter((b) => b.status === 'exceeded').length;
  const parts = [`${onTrack} of ${budgets.length} on track`];
  if (atRisk > 0) parts.push(`${atRisk} at risk`);
  if (exceeded > 0) parts.push(`${exceeded} over`);
  return parts.join(' · ');
}

/**
 * TS-BUD-101 — dedicated Budgets view, a 4th sub-tab alongside Overview/Items/Merchants
 * (ExpenseAnalysisPage's SubTabBar) rather than a new top-level nav item, matching how Recurring
 * folded into Expenses and Item/Merchant Insights folded into Analysis (TS-DES-204/205) instead
 * of growing the 4-item nav (navItems.ts's TS-DES-202 note explains why that shrink happened).
 * List + create/edit Drawer mirrors RecurringTab.tsx's shape and conventions.
 */
const BudgetsTab: React.FC = () => {
  const qc = useQueryClient();
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => listBudgets(),
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<BudgetFormState>(emptyForm());
  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<BudgetDTO | null>(null);

  const { data: suggestions } = useQuery({
    queryKey: ['budget-suggestions', form.scope],
    queryFn: () => getBudgetSuggestions(form.scope),
    enabled: formOpen && form.target_type === 'category',
  });
  const suggestion = suggestions?.find((s) => s.category === form.category);

  const saveMut = useMutation({
    mutationFn: () => createBudget({
      target_type: form.target_type,
      category: form.target_type === 'category' ? form.category : null,
      amount: parseFloat(form.amount) || 0,
      scope: form.scope,
      rollover: form.rollover,
      alert_thresholds: form.alert_thresholds,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      setFormOpen(false);
      setToast({ open: true, message: 'Budget saved', severity: 'success' });
    },
    onError: () => setToast({ open: true, message: 'Failed to save budget', severity: 'error' }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteBudget(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      setToast({ open: true, message: 'Budget deleted', severity: 'success' });
    },
    onError: () => setToast({ open: true, message: 'Failed to delete budget', severity: 'error' }),
  });

  const budgets = data || [];

  const handleAddClick = () => {
    setEditing(false);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const handleEditClick = (b: BudgetDTO) => {
    setEditing(true);
    setForm({
      id: b.id,
      target_type: b.target_type,
      category: b.category || '',
      amount: String(b.amount),
      scope: b.scope,
      rollover: b.rollover,
      alert_thresholds: b.alert_thresholds.length ? b.alert_thresholds : [...DEFAULT_THRESHOLDS],
    });
    setFormOpen(true);
  };

  const toggleThreshold = (t: number) => {
    setForm((f) => ({
      ...f,
      alert_thresholds: f.alert_thresholds.includes(t)
        ? f.alert_thresholds.filter((x) => x !== t)
        : [...f.alert_thresholds, t].sort((a, b) => a - b),
    }));
  };

  const canSave = parseFloat(form.amount) > 0 && (form.target_type === 'overall' || !!form.category);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{summarize(budgets)}</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
          sx={{ borderRadius: 999, fontWeight: 600 }}
        >
          New Budget
        </Button>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error)?.message || 'Failed to load budgets'}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {budgets.map((b) => (
          <BudgetCard
            key={b.id}
            budget={b}
            onEdit={handleEditClick}
            onDelete={(item) => { setPendingDelete(item); setConfirmDeleteOpen(true); }}
          />
        ))}
        {budgets.length === 0 && !isLoading && !isError && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="body1" color="text.secondary">
              No budgets yet — set a monthly limit for a category or overall spend.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Add/Edit Form Drawer (Bottom Sheet) — same visual language as RecurringTab/AddExpenseForm */}
      <Drawer
        anchor="bottom"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        PaperProps={{
          sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxWidth: 600, margin: '0 auto', width: '100%', maxHeight: '90vh' },
        }}
      >
        <Box sx={{ px: 3, pt: 2, pb: 4 }}>
          <Box sx={{ width: 40, height: 4, bgcolor: 'divider', borderRadius: 2, mx: 'auto', mb: 3 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 18, fontWeight: 700, color: 'text.primary' }}>
              {editing ? 'Edit Budget' : 'New Budget'}
            </Typography>
            <IconButton onClick={() => setFormOpen(false)} sx={{ mt: -1, mr: -1, color: 'text.secondary' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Grid container spacing={2}>
            <Grid size={12}>
              <SegmentedTabs<BudgetTargetType>
                value={form.target_type}
                onChange={(v) => setForm((f) => ({ ...f, target_type: v }))}
                ariaLabel="Overall or per-category budget"
                options={[
                  { value: 'overall', label: 'Overall' },
                  { value: 'category', label: 'Category' },
                ]}
              />
            </Grid>

            {form.target_type === 'category' && (
              <Grid size={12}>
                <CategoryPickerField
                  mainCategory={findMainCategory(form.category)}
                  subcategory={form.category}
                  onChange={(_main, sub) => setForm((f) => ({ ...f, category: sub }))}
                />
              </Grid>
            )}

            <Grid size={{ xs: 12, sm: form.target_type === 'category' ? 6 : 12 }}>
              <TextField
                label="Monthly limit"
                type="number"
                fullWidth
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                InputProps={{ startAdornment: <Box component="span" sx={{ mr: 0.5, color: 'text.secondary' }}>$</Box> }}
              />
              {form.target_type === 'category' && suggestion && !form.amount && (
                <Chip
                  size="small"
                  label={`Suggested: $${suggestion.suggested_amount.toFixed(0)} — tap to use`}
                  onClick={() => setForm((f) => ({ ...f, amount: String(suggestion.suggested_amount) }))}
                  sx={{ mt: 1 }}
                />
              )}
            </Grid>

            {groupsEnabled && (
              <Grid size={{ xs: 12, sm: form.target_type === 'category' ? 6 : 12 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Count spend from
                </Typography>
                <SegmentedTabs<BudgetScope>
                  value={form.scope}
                  onChange={(v) => setForm((f) => ({ ...f, scope: v }))}
                  ariaLabel="Personal or combined spend"
                  options={[
                    { value: 'personal', label: 'Personal only' },
                    { value: 'combined', label: 'Combined + groups' },
                  ]}
                />
              </Grid>
            )}

            <Grid size={12}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                Alert me at
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {THRESHOLD_OPTIONS.map((t) => (
                  <Chip
                    key={t}
                    label={`${t}%`}
                    size="small"
                    onClick={() => toggleThreshold(t)}
                    color={form.alert_thresholds.includes(t) ? 'primary' : undefined}
                    variant={form.alert_thresholds.includes(t) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            </Grid>

            <Grid size={12}>
              <FormControlLabel
                control={<Switch checked={form.rollover} onChange={(e) => setForm((f) => ({ ...f, rollover: e.target.checked }))} />}
                label="Roll over unused amount to next month"
              />
            </Grid>
          </Grid>

          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !canSave}
            sx={{ mt: 3, py: 1.5, fontSize: 15, fontWeight: 600, borderRadius: 20 }}
          >
            Save Budget
          </Button>
        </Box>
      </Drawer>

      {/* Delete Confirm Dialog */}
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle sx={{ fontFamily: 'Instrument Sans', fontWeight: 700 }}>Delete budget?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This stops tracking and alerts for this budget. Past months stay visible in Analysis history.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} sx={{ fontWeight: 600 }}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
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
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default BudgetsTab;
