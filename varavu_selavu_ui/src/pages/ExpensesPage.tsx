import React from 'react';
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  Dialog,
  IconButton,
  TableContainer,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  Chip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import AddExpenseForm from '../components/expenses/AddExpenseForm';
import GroupScopeFilter from '../components/common/GroupScopeFilter';
import { listExpenses, deleteExpense, ExpenseRecord } from '../api/expenses';
import { listAllMyGroupExpenses, UnifiedGroupExpenseRow } from '../api/groups';
import { AnalysisScope } from '../api/analysis';
import { useGroupsEnabled } from '../hooks/useGroupsEnabled';
import { parseAppDate } from '../utils/date';
import { motion } from 'framer-motion';

const ExpensesPage: React.FC = () => {
  const theme = useTheme();
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
  const expenses = data?.pages.flatMap(p => p.items) ?? [];

  // Groups/Combined scope: a separate, unpaginated fetch (Phase-1 group volumes
  // are expected to be small, spec §6.5) so these two scopes always show the
  // full merged set rather than being limited to whatever personal pages the
  // infinite-query above happens to have loaded so far. Personal scope never
  // touches these — its table/pagination below is byte-for-byte unchanged.
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

  interface UnifiedRow {
    key: string;
    date: string;
    description: string;
    category: string;
    myShare: number;
    fullAmount: number;
    groupName?: string;
  }

  const unifiedRows: UnifiedRow[] = React.useMemo(() => {
    const groupRows: UnifiedRow[] = (groupExpensesQuery.data || []).map((e: UnifiedGroupExpenseRow) => ({
      key: `group-${e.row_id}`,
      date: e.date,
      description: e.description,
      category: e.category,
      myShare: e.my_share,
      fullAmount: e.cost,
      groupName: e.group_name,
    }));
    const byDateDesc = (a: UnifiedRow, b: UnifiedRow) => parseAppDate(b.date).getTime() - parseAppDate(a.date).getTime();
    if (scope === 'groups') return groupRows.sort(byDateDesc);
    const personalRows: UnifiedRow[] = (combinedPersonalQuery.data?.items || []).map((e) => ({
      key: `personal-${e.row_id}`,
      date: e.date,
      description: e.description,
      category: e.category,
      myShare: e.cost,
      fullAmount: e.cost,
    }));
    return [...personalRows, ...groupRows].sort(byDateDesc);
  }, [scope, groupExpensesQuery.data, combinedPersonalQuery.data]);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExpenseRecord | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' }
  );
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<ExpenseRecord | null>(null);

  const handleDelete = async (row_id: number) => {
    try {
      setDeletingId(row_id);
      await deleteExpense(row_id);
      queryClient.invalidateQueries({ queryKey: ['expenses', user] });
      setToast({ open: true, message: 'Expense deleted', severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: 'Failed to delete expense', severity: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEditing(null);
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses', user] });
    handleClose();
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
      {scope === 'personal' && (
      <TableContainer component={Paper} sx={{ borderRadius: 2, mb: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, backgroundColor: 'primary.main', color: 'primary.contrastText' }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600, backgroundColor: 'primary.main', color: 'primary.contrastText' }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600, backgroundColor: 'primary.main', color: 'primary.contrastText' }}>Merchant</TableCell>
              <TableCell sx={{ fontWeight: 600, backgroundColor: 'primary.main', color: 'primary.contrastText' }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 600, backgroundColor: 'primary.main', color: 'primary.contrastText' }} align="right">Cost</TableCell>
              <TableCell sx={{ backgroundColor: 'primary.main', color: 'primary.contrastText' }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {expenses.map(exp => (
              <TableRow
                key={exp.row_id}
                hover
                sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}
              >
                <TableCell>{exp.date}</TableCell>
                <TableCell>{exp.description}</TableCell>
                <TableCell>
                  {exp.merchant_name
                    ? <span title={exp.merchant_name} style={{ fontWeight: 500 }}>{exp.merchant_name}</span>
                    : <span style={{ color: '#aaa' }}>—</span>}
                </TableCell>
                <TableCell>{exp.category}</TableCell>
                <TableCell align="right">${exp.cost.toFixed(2)}</TableCell>
                <TableCell>
                  <IconButton
                    aria-label="edit"
                    onClick={() => {
                      setEditing(exp);
                      setOpen(true);
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    aria-label="delete"
                    onClick={() => { setPendingDelete(exp); setConfirmOpen(true); }}
                    disabled={deletingId === exp.row_id}
                  >
                    {deletingId === exp.row_id ? <CircularProgress size={18} /> : <DeleteIcon />}
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      )}
      {scope !== 'personal' && (
      <Paper sx={{ borderRadius: 3, overflow: 'hidden', mb: 2 }}>
        {(groupExpensesQuery.isLoading || (scope === 'combined' && combinedPersonalQuery.isLoading)) && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={20} />
          </Box>
        )}
        {unifiedRows.map((row, idx) => (
          <Box
            key={row.key}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2.5,
              py: 1.75,
              borderTop: idx === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
              transition: 'background-color 0.15s ease',
              '&:hover': { backgroundColor: theme.palette.action.hover },
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                color: 'text.secondary',
              }}
            >
              <ReceiptLongRoundedIcon fontSize="small" />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                  {row.description}
                </Typography>
                {row.groupName && <Chip size="small" label={row.groupName} />}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {row.category} · {row.date}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                ${row.myShare.toFixed(2)}
              </Typography>
              {row.groupName && (
                <Typography variant="caption" color="text.secondary">
                  ${row.fullAmount.toFixed(2)} total
                </Typography>
              )}
            </Box>
          </Box>
        ))}
        {!groupExpensesQuery.isLoading && unifiedRows.length === 0 && (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No expenses in this scope</Typography>
          </Box>
        )}
      </Paper>
      )}
      {scope === 'personal' && hasNextPage && (
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Button variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <CircularProgress size={24} /> : 'Load More'}
          </Button>
        </Box>
      )}
      </motion.div>
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
                if (id) handleDelete(id);
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
