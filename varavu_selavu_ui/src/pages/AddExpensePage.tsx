import React from 'react';
import AddExpenseForm from '../components/expenses/AddExpenseForm';
import { Box, Typography } from '@mui/material';

const AddExpensePage: React.FC = () => {
  return (
    <Box sx={{ mt: 4, maxWidth: 600, mx: 'auto', px: { xs: 1, sm: 2 } }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Log a New Expense
      </Typography>
      <AddExpenseForm />
    </Box>
  );
};

export default AddExpensePage;
