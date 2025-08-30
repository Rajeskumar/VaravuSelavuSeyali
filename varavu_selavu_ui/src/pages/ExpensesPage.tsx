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

  const handleDelete = async (row_id: number) => {
    await deleteExpense(row_id);
    queryClient.invalidateQueries({ queryKey: ['expenses', user] });
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
        <Button variant="contained" onClick={() => setOpen(true)}>
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
                    onClick={() => handleDelete(exp.row_id)}
                  >
                    <DeleteIcon />
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
          <AddExpenseForm existing={editing} onSuccess={handleSuccess} onCancel={handleClose} />
        </Box>
      </Dialog>
    </Box>
  );
};

export default ExpensesPage;
