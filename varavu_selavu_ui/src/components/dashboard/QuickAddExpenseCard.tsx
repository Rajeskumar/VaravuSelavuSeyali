import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button
} from '@mui/material';
import { addExpense } from '../../api/expenses';
import { isoToMMDDYYYY } from '../../utils/date';

interface Props {
  onAdded?: () => void;
}

const QuickAddExpenseCard: React.FC<Props> = ({ onAdded }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  const handleAdd = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await addExpense({
        user_id: user,
        date: isoToMMDDYYYY(date),
        description,
        category,
        cost: parseFloat(amount) || 0,
      });
      setCategory('');
      setDescription('');
      setAmount('');
      onAdded?.();
    } catch {
      // ignore errors for quick add
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      sx={{
        backdropFilter: 'blur(6px)',
        background: 'rgba(255,255,255,0.4)',
        border: '1px solid rgba(255,255,255,0.2)',
        animation: 'fadeIn 0.5s ease'
      }}
    >
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="h6" gutterBottom>
          Quick Add Expense
        </Typography>
        <TextField size="small" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <TextField size="small" label="Category" value={category} onChange={e => setCategory(e.target.value)} />
        <TextField size="small" label="Description" value={description} onChange={e => setDescription(e.target.value)} />
        <TextField size="small" label="Amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
        <Button variant="contained" onClick={handleAdd} disabled={saving || !user}>
          {saving ? 'Adding...' : 'Add'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default QuickAddExpenseCard;
