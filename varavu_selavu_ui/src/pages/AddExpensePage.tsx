import React from 'react';
import { useState } from 'react';
import AddExpenseForm from '../components/expenses/AddExpenseForm';
import UploadReceiptForm from '../components/expenses/UploadReceiptForm';
import { Box, Typography, Tabs, Tab } from '@mui/material';

const AddExpensePage: React.FC = () => {
  const [mode, setMode] = useState<'manual' | 'upload'>('manual');
  return (
    <Box sx={{ mt: 4, maxWidth: 600, mx: 'auto', px: { xs: 1, sm: 2 } }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Log a New Expense
      </Typography>
      <Tabs value={mode} onChange={(e, v) => setMode(v)}>
        <Tab label="Manual" value="manual" />
        <Tab label="Upload Receipt" value="upload" />
      </Tabs>
      {mode === 'manual' ? <AddExpenseForm /> : <UploadReceiptForm />}
    </Box>
  );
};

export default AddExpensePage;
