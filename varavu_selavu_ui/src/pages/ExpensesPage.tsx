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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AddExpenseForm from '../components/expenses/AddExpenseForm';
import { listExpenses, ExpenseRecord } from '../api/expenses';

const ExpensesPage: React.FC = () => {
  const user = localStorage.getItem('vs_user') || '';
  const queryClient = useQueryClient();
  const { data: expenses = [] } = useQuery<ExpenseRecord[]>({
    queryKey: ['expenses', user],
    queryFn: () => listExpenses(user),
    enabled: !!user,
  });
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExpenseRecord | null>(null);

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
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Description</TableCell>
            <TableCell>Category</TableCell>
            <TableCell align="right">Cost</TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {expenses.map(exp => (
            <TableRow key={exp.row_id} hover>
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <Box sx={{ p: 2 }}>
          <AddExpenseForm existing={editing} onSuccess={handleSuccess} onCancel={handleClose} />
        </Box>
      </Dialog>
    </Box>
  );
};

export default ExpensesPage;
