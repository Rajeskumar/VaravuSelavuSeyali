import React from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/CloseRounded';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { typeScale, tabularNums } from '../../theme';
import { CATEGORY_GROUPS, findMainCategory } from './AddExpenseForm';
import { formatMoney } from './ExpenseFeed';
import type { FeedExpense } from './ExpenseFeed';
import { formatAppDate } from '../../utils/date';

export interface ExpenseDetailForm {
  merchantName: string;
  category: string; // subcategory
  amount: string;
  notes: string;
}

interface ExpenseDetailSheetProps {
  expense: FeedExpense | null;
  open: boolean;
  onClose: () => void;
  onSave: (expense: FeedExpense, patch: ExpenseDetailForm) => Promise<void> | void;
  onDelete: (expense: FeedExpense) => Promise<void> | void;
  onMoveToGroup?: (expense: FeedExpense) => void;
  saving?: boolean;
  deleting?: boolean;
}

/**
 * Tap-to-open detail sheet with inline edit (merchant, category, amount,
 * notes) and delete (TS-DES-102). `Drawer anchor="bottom"` at mobile widths,
 * right-side panel at desktop widths, per Design Spec §5 — reusing MUI's
 * `Drawer` rather than a bespoke bottom-sheet like the JS prototype's, since
 * `Drawer` already gives us both anchor behaviors for free.
 */
const ExpenseDetailSheet: React.FC<ExpenseDetailSheetProps> = ({
  expense,
  open,
  onClose,
  onSave,
  onDelete,
  onMoveToGroup,
  saving,
  deleting,
}) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const [form, setForm] = React.useState<ExpenseDetailForm | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  React.useEffect(() => {
    if (expense) {
      setForm({
        merchantName: expense.merchantName || expense.description,
        category: expense.category,
        amount: Math.abs(expense.groupAmount ?? expense.amount).toFixed(2),
        notes: expense.notes || '',
      });
      setConfirmingDelete(false);
    } else {
      setForm(null);
    }
  }, [expense]);

  if (!expense || !form) return null;

  const mainCategory = findMainCategory(form.category);
  const subOptions = CATEGORY_GROUPS[mainCategory] || [];

  const handleSave = async () => {
    await onSave(expense, form);
  };

  return (
    <Drawer
      anchor={isDesktop ? 'right' : 'bottom'}
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: false }}
      PaperProps={{
        sx: {
          width: isDesktop ? 400 : '100%',
          maxWidth: '100%',
          borderTopLeftRadius: isDesktop ? 0 : theme.shape.borderRadius,
          borderTopRightRadius: isDesktop ? 0 : theme.shape.borderRadius,
          p: 3,
        },
      }}
    >
      {!isDesktop && (
        <Box
          sx={{
            width: 36,
            height: 4,
            borderRadius: 999,
            backgroundColor: theme.palette.divider,
            mx: 'auto',
            mb: 2,
          }}
        />
      )}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {formatAppDate(expense.date)}
          </Typography>
          <Typography sx={{ ...typeScale.display, color: theme.palette.text.primary }}>
            {formatMoney(expense.groupAmount ?? expense.amount)}
          </Typography>
          {expense.kind === 'group' && (
            <Typography variant="caption" color="text.secondary">
              {expense.groupName} · your share {formatMoney(expense.amount)}
            </Typography>
          )}
        </Box>
        <IconButton aria-label="close" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Merchant"
          fullWidth
          value={form.merchantName}
          onChange={(e) => setForm({ ...form, merchantName: e.target.value })}
        />
        <TextField
          select
          label="Category"
          fullWidth
          value={subOptions.includes(form.category) ? form.category : subOptions[0] || ''}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {subOptions.map((sub) => (
            <MenuItem key={sub} value={sub}>
              {mainCategory} · {sub}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Amount"
          type="number"
          fullWidth
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          inputProps={{ min: 0, step: 0.01, style: tabularNums }}
        />
        <TextField
          label="Notes"
          fullWidth
          multiline
          minRows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Add a note"
        />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 3 }}>
        <Button variant="contained" size="large" onClick={handleSave} disabled={saving || deleting}>
          {saving ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : 'Save changes'}
        </Button>
        {expense.kind === 'personal' && onMoveToGroup && (
          <Button variant="outlined" size="large" onClick={() => onMoveToGroup(expense)} disabled={saving || deleting}>
            Move to group…
          </Button>
        )}
        {!confirmingDelete ? (
          <Button variant="text" color="error" size="large" onClick={() => setConfirmingDelete(true)} disabled={saving || deleting}>
            Delete expense
          </Button>
        ) : (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" fullWidth onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              fullWidth
              onClick={() => onDelete(expense)}
              disabled={deleting}
            >
              {deleting ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : 'Confirm delete'}
            </Button>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default ExpenseDetailSheet;
