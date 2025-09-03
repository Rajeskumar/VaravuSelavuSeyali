import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, Typography, TextField, Button, MenuItem } from '@mui/material';
import { addExpense, suggestCategory } from '../../api/expenses';
import { isoToMMDDYYYY } from '../../utils/date';

interface Props {
  onAdded?: () => void;
}

const QuickAddExpenseCard: React.FC<Props> = ({ onAdded }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  // Category structure aligned with AddExpenseForm
  const CATEGORY_GROUPS: Record<string, string[]> = {
    Home: ['Rent', 'Electronics', 'Furniture', 'Household supplies', 'Maintenance', 'Mortgage', 'Other', 'Pets', 'Services'],
    Transportation: ['Gas/fuel', 'Car', 'Parking', 'Plane', 'Other', 'Bicycle', 'Bus/Train', 'Taxi', 'Hotel'],
    'Food & Drink': ['Groceries', 'Dining out', 'Liquor', 'Other'],
    Entertainment: ['Movies', 'Other', 'Games', 'Music', 'Sports'],
    Life: ['Medical expenses', 'Insurance', 'Taxes', 'Education', 'Childcare', 'Clothing', 'Gifts', 'Other'],
    Other: ['Services', 'General', 'Electronics'],
    Utilities: ['Heat/gas', 'Electricity', 'Water', 'Other', 'Cleaning', 'Trash', 'Other', 'TV/Phone/Internet'],
  };
  const defaultMain = Object.keys(CATEGORY_GROUPS)[0];
  const [mainCategory, setMainCategory] = useState<string>(defaultMain);
  const [subcategory, setSubcategory] = useState<string>(CATEGORY_GROUPS[defaultMain][0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [userPickedCategory, setUserPickedCategory] = useState(false);
  const typingRef = useRef<NodeJS.Timeout | null>(null);
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  const handleAdd = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await addExpense({
        user_id: user,
        date: isoToMMDDYYYY(date),
        description,
        category: subcategory,
        cost: parseFloat(amount) || 0,
      });
      setMainCategory(defaultMain);
      setSubcategory(CATEGORY_GROUPS[defaultMain][0]);
      setDescription('');
      setAmount('');
      setUserPickedCategory(false);
      onAdded?.();
    } catch {
      // ignore errors for quick add
    } finally {
      setSaving(false);
    }
  };

  // Auto-categorize using backend when user types description
  const fetchCategory = async () => {
    if (!description.trim() || userPickedCategory) return;
    try {
      const res = await suggestCategory(description.trim());
      if (CATEGORY_GROUPS[res.main_category]?.includes(res.subcategory)) {
        setMainCategory(res.main_category);
        setSubcategory(res.subcategory);
      }
    } catch {
      // ignore errors for quick add
    }
  };

  const scheduleFetch = () => {
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = setTimeout(fetchCategory, 1500);
  };

  useEffect(() => () => { if (typingRef.current) clearTimeout(typingRef.current); }, []);

  return (
    <Card
      sx={{
        backdropFilter: 'blur(8px)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(240,255,244,0.75) 100%)',
        border: '1px solid rgba(255,255,255,0.35)',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
        borderRadius: 3,
        animation: 'fadeIn 0.5s ease'
      }}
    >
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="h6" gutterBottom>
          Quick Add Expense
        </Typography>
        <TextField size="small" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <TextField
          select
          size="small"
          label="Main Category"
          value={mainCategory}
          onChange={e => {
            const m = e.target.value;
            setMainCategory(m);
            setSubcategory(CATEGORY_GROUPS[m][0]);
            setUserPickedCategory(true);
          }}
        >
          {Object.keys(CATEGORY_GROUPS).map(category => (
            <MenuItem key={category} value={category}>
              {category}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Subcategory"
          value={subcategory}
          onChange={e => { setSubcategory(e.target.value); setUserPickedCategory(true); }}
        >
          {CATEGORY_GROUPS[mainCategory].map(sub => (
            <MenuItem key={sub} value={sub}>
              {sub}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Description"
          value={description}
          onChange={e => { setDescription(e.target.value); scheduleFetch(); }}
          onBlur={fetchCategory}
        />
        <TextField size="small" label="Amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
        <Button variant="contained" onClick={handleAdd} disabled={saving || !user}>
          {saving ? 'Adding...' : 'Add'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default QuickAddExpenseCard;
