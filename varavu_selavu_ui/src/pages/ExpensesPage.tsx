import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import AddExpenseForm, { findMainCategory } from '../components/expenses/AddExpenseForm';
import GroupScopeFilter from '../components/common/GroupScopeFilter';
import ExpenseFeed, { FeedExpense } from '../components/expenses/ExpenseFeed';
import ExpenseDetailSheet, { ExpenseDetailForm } from '../components/expenses/ExpenseDetailSheet';
import MoveToGroupDialog from '../components/expenses/MoveToGroupDialog';
import { listExpenses, deleteExpense, updateExpense, ExpenseRecord } from '../api/expenses';
import {
  listAllMyGroupExpenses,
  updateGroupExpense,
  deleteGroupExpense,
  UnifiedGroupExpenseRow,
} from '../api/groups';
import { AnalysisScope } from '../api/analysis';
import { useGroupsEnabled } from '../hooks/useGroupsEnabled';

/**
 * ExpensesPage (TS-DES-102 rebuild) — all three scopes (personal/groups/
 * combined) now render through the single day-grouped `ExpenseFeed`
 * component instead of the old scope-conditional `<Table>` (personal) /
 * `<Box>`-row list (groups/combined). See
 * `docs/design/tickets/TS-DES-102-expenses-feed-rebuild.md`.
 */
const ExpensesPage: React.FC = () => {
  const user = localStorage.getItem('vs_user') || '';
  const queryClient = useQueryClient();
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const [scope, setScope] = React.useState<AnalysisScope>('personal');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['expenses', user],
    queryFn: ({ pageParam = 0 }) => listExpenses(pageParam),
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
    enabled: !!user,
    initialPageParam: 0,
  });
  const personalExpenses: ExpenseRecord[] = data?.pages.flatMap((p) => p.items) ?? [];

  // Groups/Combined scope: a separate, unpaginated fetch (Phase-1 group volumes
  // are expected to be small, spec §6.5) so these two scopes always show the
  // full merged set rather than being limited to whatever personal pages the
  // infinite-query above happens to have loaded so far.
  const groupExpensesQuery = useQuery({
    queryKey: ['all-group-expenses'],
    queryFn: listAllMyGroupExpenses,
    enabled: groupsEnabled && scope !== 'personal',
  });
  const combinedPersonalQuery = useQuery({
    queryKey: ['expenses-full-for-combined', user],
    queryFn: () => listExpenses(0, 500),
    enabled: !!user && scope === 'combined',
  });

  const feedLoading =
    (scope === 'personal' && !data) ||
    (scope === 'groups' && groupExpensesQuery.isLoading) ||
    (scope === 'combined' && (groupExpensesQuery.isLoading || combinedPersonalQuery.isLoading));

  const feedExpenses: FeedExpense[] = React.useMemo(() => {
    const groupRows: FeedExpense[] = (groupExpensesQuery.data || []).map((e: UnifiedGroupExpenseRow) => ({
      key: `group-${e.row_id}`,
      kind: 'group',
      id: e.row_id,
      groupId: e.group_id,
      date: e.date,
      description: e.description,
      merchantName: e.merchant_name || undefined,
      category: e.category,
      mainCategory: findMainCategory(e.category),
      amount: e.my_share,
      groupAmount: e.cost,
      groupName: e.group_name,
      payerSummary: e.payer_summary,
    }));

    if (scope === 'groups') {
      return groupRows;
    }

    if (scope === 'personal') {
      return personalExpenses.map((e) => ({
        key: `personal-${e.row_id}`,
        kind: 'personal',
        id: e.row_id,
        date: e.date,
        description: e.description,
        merchantName: e.merchant_name || undefined,
        category: e.category,
        mainCategory: findMainCategory(e.category),
        amount: e.cost,
      }));
    }

    // combined
    const personalRows: FeedExpense[] = (combinedPersonalQuery.data?.items || []).map((e) => ({
      key: `personal-${e.row_id}`,
      kind: 'personal',
      id: e.row_id,
      date: e.date,
      description: e.description,
      merchantName: e.merchant_name || undefined,
      category: e.category,
      mainCategory: findMainCategory(e.category),
      amount: e.cost,
    }));
    return [...personalRows, ...groupRows];
  }, [scope, groupExpensesQuery.data, personalExpenses, combinedPersonalQuery.data]);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExpenseRecord | null>(null);
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' }
  );
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<ExpenseRecord | null>(null);

  // --- Detail sheet state (tap-to-open, inline edit — TS-DES-102) ---
  const [detailExpense, setDetailExpense] = React.useState<FeedExpense | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailSaving, setDetailSaving] = React.useState(false);
  const [detailDeleting, setDetailDeleting] = React.useState(false);
  const [moveExpense, setMoveExpense] = React.useState<FeedExpense | null>(null);

  const invalidateForScope = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses', user] });
    queryClient.invalidateQueries({ queryKey: ['expenses-full-for-combined', user] });
    queryClient.invalidateQueries({ queryKey: ['all-group-expenses'] });
  };

  const handleDeletePersonal = async (row_id: number) => {
    try {
      setDeletingKey(`personal-${row_id}`);
      await deleteExpense(row_id);
      invalidateForScope();
      setToast({ open: true, message: 'Expense deleted', severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: 'Failed to delete expense', severity: 'error' });
    } finally {
      setDeletingKey(null);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEditing(null);
  };

  const handleSuccess = () => {
    invalidateForScope();
    handleClose();
  };

  // --- Row-level actions wired from ExpenseFeed (hover-reveal edit/delete + tap-to-open) ---
  const handleRowSelect = (expense: FeedExpense) => {
    setDetailExpense(expense);
    setDetailOpen(true);
  };

  const handleRowEdit = (expense: FeedExpense) => {
    if (expense.kind === 'personal') {
      const record = personalExpenses.find((e) => e.row_id === expense.id) || combinedPersonalQuery.data?.items.find((e) => e.row_id === expense.id);
      if (record) {
        setEditing(record);
        setOpen(true);
        return;
      }
    }
    // Group rows (and any personal row we couldn't resolve back to a full
    // record) fall back to the detail sheet's inline editor.
    handleRowSelect(expense);
  };

  const handleRowDeleteRequest = (expense: FeedExpense) => {
    if (expense.kind === 'personal') {
      const record = personalExpenses.find((e) => e.row_id === expense.id) || combinedPersonalQuery.data?.items.find((e) => e.row_id === expense.id);
      setPendingDelete(
        record || {
          row_id: expense.id as number,
          user_id: user,
          date: expense.date,
          description: expense.description,
          category: expense.category,
          cost: expense.amount,
          merchant_name: expense.merchantName,
        }
      );
      setConfirmOpen(true);
      return;
    }
    // Group rows: delete directly (no separate confirm dialog exists for
    // group expenses in this codebase yet — matching the immediate-delete
    // behavior the old <Box>-row list had, since it never wired a delete
    // affordance for group rows at all).
    handleGroupDelete(expense);
  };

  const handleGroupDelete = async (expense: FeedExpense) => {
    if (!expense.groupId) return;
    try {
      setDeletingKey(expense.key);
      await deleteGroupExpense(expense.groupId, String(expense.id));
      invalidateForScope();
      setToast({ open: true, message: 'Expense deleted', severity: 'success' });
      if (detailExpense?.key === expense.key) setDetailOpen(false);
    } catch (e) {
      setToast({ open: true, message: 'Failed to delete expense', severity: 'error' });
    } finally {
      setDeletingKey(null);
    }
  };

  const handleDetailSave = async (expense: FeedExpense, patch: ExpenseDetailForm) => {
    setDetailSaving(true);
    try {
      const amount = parseFloat(patch.amount) || 0;
      // The detail sheet edits merchant/category/amount/notes only (matching
      // the reference prototype) — the underlying `description` field is
      // preserved as-is rather than overwritten with the merchant name, so a
      // personal expense's distinct description ("Coffee run") isn't clobbered
      // just because its merchant field was edited ("Starbucks"). `date` is
      // likewise preserved unchanged — it's already in the MM/DD/YYYY shape
      // both update endpoints expect, and this sheet doesn't expose a date
      // field to edit.
      if (expense.kind === 'personal') {
        await updateExpense(expense.id as number, {
          user_id: user,
          date: expense.date,
          description: expense.description,
          category: patch.category,
          cost: amount,
          merchant_name: patch.merchantName || undefined,
        });
      } else if (expense.groupId) {
        // Phase-1 group expenses are always equal-split (AddExpenseForm never
        // offers exact/percentage yet), and the group-expense list endpoint
        // doesn't return the original split entries — only payer_summary. So
        // an edit here preserves the existing payer(s) (threaded through as
        // `payerSummary` on the FeedExpense) and re-submits an equal split
        // across them, which reproduces current behavior for every group
        // expense that exists today. A true "edit split" flow is out of
        // scope for this ticket (no split editor is part of this detail
        // sheet) and should be a follow-up if group expenses ever gain
        // non-equal splits before this component gets revisited.
        const payers = expense.payerSummary?.length
          ? expense.payerSummary.map((p) => ({ member_id: p.member_id, amount_paid: amount }))
          : [];
        await updateGroupExpense(expense.groupId, String(expense.id), {
          date: expense.date,
          description: expense.description,
          category: patch.category,
          amount,
          merchant_name: patch.merchantName || undefined,
          payers,
          split: { type: 'equal', entries: payers.map((p) => ({ member_id: p.member_id })) },
        });
      }
      invalidateForScope();
      setToast({ open: true, message: 'Expense updated', severity: 'success' });
      setDetailOpen(false);
    } catch (e) {
      setToast({ open: true, message: 'Failed to update expense', severity: 'error' });
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDetailDelete = async (expense: FeedExpense) => {
    if (expense.kind === 'personal') {
      setDetailDeleting(true);
      try {
        await deleteExpense(expense.id as number);
        invalidateForScope();
        setToast({ open: true, message: 'Expense deleted', severity: 'success' });
        setDetailOpen(false);
      } catch (e) {
        setToast({ open: true, message: 'Failed to delete expense', severity: 'error' });
      } finally {
        setDetailDeleting(false);
      }
      return;
    }
    setDetailDeleting(true);
    await handleGroupDelete(expense);
    setDetailDeleting(false);
  };

  return (
    <Box sx={{ mt: 4, px: { xs: 1, sm: 2 } }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Expenses
          </Typography>
          {groupsEnabled && <GroupScopeFilter value={scope} onChange={setScope} />}
          <Button variant="contained" onClick={() => { setEditing(null); setOpen(true); }}>
            Add Expense
          </Button>
        </Box>

        <ExpenseFeed
          expenses={feedExpenses}
          loading={feedLoading}
          onSelect={handleRowSelect}
          onEdit={handleRowEdit}
          onDelete={handleRowDeleteRequest}
          deletingKey={deletingKey}
          onLoadMore={scope === 'personal' ? () => fetchNextPage() : undefined}
          hasMore={scope === 'personal' ? !!hasNextPage : false}
          loadingMore={isFetchingNextPage}
        />
      </motion.div>

      <ExpenseDetailSheet
        expense={detailExpense}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSave={handleDetailSave}
        onDelete={handleDetailDelete}
        onMoveToGroup={
          groupsEnabled
            ? (expense) => {
                setDetailOpen(false);
                setMoveExpense(expense);
              }
            : undefined
        }
        saving={detailSaving}
        deleting={detailDeleting}
      />

      <MoveToGroupDialog
        open={!!moveExpense}
        expenseId={moveExpense ? (moveExpense.id as number) : null}
        amount={moveExpense ? Math.abs(moveExpense.amount) : 0}
        onClose={() => setMoveExpense(null)}
        onSuccess={() => {
          invalidateForScope();
          setMoveExpense(null);
          setToast({ open: true, message: 'Expense moved to group', severity: 'success' });
        }}
      />

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <Box sx={{ p: 2 }}>
          <AddExpenseForm
            existing={editing}
            onSuccess={() => {
              // Differentiate add vs edit using current editing value
              const wasEdit = !!editing;
              handleSuccess();
              setToast({ open: true, message: wasEdit ? 'Expense updated' : 'Expense added', severity: 'success' });
            }}
            onError={(msg) => setToast({ open: true, message: msg, severity: 'error' })}
            onCancel={handleClose}
          />
        </Box>
      </Dialog>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <Box sx={{ p: 3, minWidth: 320 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Delete expense?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This action cannot be undone.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button color="error" variant="contained"
              onClick={() => {
                const id = pendingDelete?.row_id;
                setConfirmOpen(false);
                if (id) handleDeletePersonal(id);
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

export default ExpensesPage;
