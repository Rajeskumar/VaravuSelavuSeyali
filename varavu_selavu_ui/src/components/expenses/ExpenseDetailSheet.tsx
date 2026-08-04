import React from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Toolbar from '@mui/material/Toolbar';
import CloseIcon from '@mui/icons-material/CloseRounded';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { typeScale, tabularNums } from '../../theme';
import { findMainCategory } from './AddExpenseForm';
import { formatMoney, dayLabel } from './ExpenseFeed';
import type { FeedExpense } from './ExpenseFeed';
import { parseAppDate, isoToMMDDYYYY, toISODate } from '../../utils/date';
import { getExpenseItems, updateExpenseItems } from '../../api/expenses';
import { getGroupExpenseItems, updateGroupExpenseItems } from '../../api/groups';
import ScannedItemsCard, { ScannedItem } from './ScannedItemsCard';
import CategoryPickerField from './CategoryPickerField';

export interface ExpenseDetailForm {
  merchantName: string;
  category: string; // subcategory
  amount: string;
  notes: string;
  /** ISO 'YYYY-MM-DD' — the shape the native `<input type="date">` needs. Callers
   * converting back to the MM/DD/YYYY the update endpoints expect should use
   * `isoToMMDDYYYY` from `utils/date`. */
  date: string;
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

  // Itemized expenses (receipt-scanned) get a line-item review/edit section, reusing the
  // same ScannedItemsCard the create flow uses. itemsLoaded distinguishes "no items to
  // show" from "haven't fetched yet" so the save handler knows whether to also call
  // updateExpenseItems.
  const isItemized = !!expense && (expense.splitType === 'itemized' || (expense.itemCount || 0) > 1);
  const [items, setItems] = React.useState<ScannedItem[]>([]);
  const [itemsTax, setItemsTax] = React.useState(0);
  const [itemsDiscount, setItemsDiscount] = React.useState(0);
  const [itemsLoaded, setItemsLoaded] = React.useState(false);

  React.useEffect(() => {
    if (expense) {
      setForm({
        merchantName: expense.merchantName || expense.description,
        category: expense.category,
        amount: Math.abs(expense.groupAmount ?? expense.amount).toFixed(2),
        notes: expense.notes || '',
        // `FeedExpense.date` can arrive as either MM/DD/YYYY or YYYY-MM-DD depending on
        // source — `parseAppDate` handles both; `mmddyyyyToISO` alone would mis-parse an
        // already-ISO date.
        date: toISODate(parseAppDate(expense.date)),
      });
      setConfirmingDelete(false);
    } else {
      setForm(null);
    }
    setItems([]);
    setItemsLoaded(false);
  }, [expense]);

  React.useEffect(() => {
    if (!expense || !isItemized) return;
    let mounted = true;
    // Group rows in this unified feed need the group-scoped items endpoint — the personal one
    // (`getExpenseItems`) is scoped server-side to `group_id IS NULL` and 404s for these, which
    // silently left the items section unrendered (`itemsLoaded` never flipped true) for every
    // itemized group expense opened from the main Expenses page.
    const fetchItems = expense.kind === 'group' && expense.groupId
      ? getGroupExpenseItems(expense.groupId, String(expense.id))
      : getExpenseItems(expense.id);
    fetchItems
      .then((res) => {
        if (!mounted) return;
        setItems(res.items.map((it) => ({
          line_no: it.line_no,
          item_name: it.item_name,
          line_total: it.line_total,
          quantity: it.quantity,
          unit_price: it.unit_price,
          normalized_name: it.normalized_name || undefined,
        })));
        setItemsTax(res.tax);
        setItemsDiscount(res.discount);
        setItemsLoaded(true);
      })
      .catch(() => { /* falls back to the flat amount field only */ });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense?.id, isItemized]);

  if (!expense || !form) return null;

  const handleSave = async () => {
    if (itemsLoaded && items.length > 0) {
      const itemsPayload = {
        items: items.map((it) => ({
          line_no: it.line_no,
          item_name: it.item_name,
          normalized_name: it.normalized_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.line_total,
        })),
        amount: parseFloat(form.amount) || 0,
        tax: itemsTax,
        discount: itemsDiscount,
      };
      if (expense.kind === 'group' && expense.groupId) {
        await updateGroupExpenseItems(expense.groupId, String(expense.id), itemsPayload);
      } else {
        await updateExpenseItems(expense.id, itemsPayload);
      }
    }
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
      {isDesktop && <Toolbar />}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {dayLabel(parseAppDate(expense.date))}
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
        <CategoryPickerField
          mainCategory={findMainCategory(form.category)}
          subcategory={form.category}
          onChange={(_main, sub) => setForm({ ...form, category: sub })}
        />
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField
            label="Date"
            type="date"
            fullWidth
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Amount"
            type="number"
            fullWidth
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            inputProps={{ min: 0, step: 0.01, style: tabularNums }}
          />
        </Box>
        <TextField
          label="Notes"
          fullWidth
          multiline
          minRows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Add a note"
        />

        {itemsLoaded && items.length > 0 && (
          <ScannedItemsCard
            items={items}
            onChange={setItems}
            merchant={form.merchantName}
            tax={itemsTax}
            discount={itemsDiscount}
            currentAmount={parseFloat(form.amount) || 0}
          />
        )}
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
