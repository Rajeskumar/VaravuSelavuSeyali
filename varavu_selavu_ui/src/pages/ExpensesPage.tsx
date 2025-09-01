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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import AddExpenseForm from '../components/expenses/AddExpenseForm';
import { listExpenses, deleteExpense, ExpenseRecord } from '../api/expenses';

const ExpensesPage: React.FC = () => {
  const user = localStorage.getItem('vs_user') || '';
  const queryClient = useQueryClient();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['expenses', user],
    queryFn: ({ pageParam = 0 }) => listExpenses(user, pageParam),
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
    enabled: !!user,
    initialPageParam: 0,
  });
  const expenses = data?.pages.flatMap(p => p.items) ?? [];
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Expenses
        </Typography>
        <Button variant="contained" onClick={() => { setEditing(null); setOpen(true); }}>
          Add Expense
        </Button>
      </Box>
      <TableContainer component={Paper} sx={{ borderRadius: 2, mb: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, backgroundColor: 'primary.main', color: 'primary.contrastText' }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600, backgroundColor: 'primary.main', color: 'primary.contrastText' }}>Description</TableCell>
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
      {hasNextPage && (
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Button variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <CircularProgress size={24} /> : 'Load More'}
          </Button>
        </Box>
      )}
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
