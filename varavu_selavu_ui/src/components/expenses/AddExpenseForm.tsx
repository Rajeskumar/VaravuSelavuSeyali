import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { addExpense, parseReceipt, addExpenseWithItems } from '../../api/expenses';

const CATEGORY_GROUPS: Record<string, string[]> = {
  Home: ['Rent', 'Electronics', 'Furniture', 'Household supplies', 'Maintenance', 'Mortgage', 'Other', 'Pets', 'Services'],
  Transportation: ['Gas/fuel', 'Car', 'Parking', 'Plane', 'Other', 'Bicycle', 'Bus/Train', 'Taxi', 'Hotel'],
  'Food & Drink': ['Groceries', 'Dining out', 'Liquor', 'Other'],
  Entertainment: ['Movies', 'Other', 'Games', 'Music', 'Sports'],
  Life: ['Medical expenses', 'Insurance', 'Taxes', 'Education', 'Childcare', 'Clothing', 'Gifts', 'Other'],
  Other: ['Services', 'General', 'Electronics'],
  Utilities: ['Heat/gas', 'Electricity', 'Water', 'Other', 'Cleaning', 'Trash', 'Other', 'TV/Phone/Internet'],
};

const findMainCategory = (sub: string): string => {
  return (
    Object.keys(CATEGORY_GROUPS).find(m => CATEGORY_GROUPS[m].includes(sub)) ||
    Object.keys(CATEGORY_GROUPS)[0]
  );
};

const AddExpenseForm: React.FC = () => {
  const defaultMain = Object.keys(CATEGORY_GROUPS)[0];
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState(0);
  const [mainCategory, setMainCategory] = useState(defaultMain);
  const [subcategory, setSubcategory] = useState(CATEGORY_GROUPS[defaultMain][0]);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleMainCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMain = e.target.value;
    setMainCategory(newMain);
    setSubcategory(CATEGORY_GROUPS[newMain][0]);
    if (draft) {
      setDraft({ ...draft, header: { ...draft.header, main_category_name: newMain, category_name: CATEGORY_GROUPS[newMain][0] } });
    }
  };

  const handleSubcategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sub = e.target.value;
    setSubcategory(sub);
    if (draft) setDraft({ ...draft, header: { ...draft.header, category_name: sub } });
  };

  const handleParse = async () => {
    if (!file) return;
    try {
      const res = await parseReceipt(file);
      setDraft(res);
      const hdr = res.header || {};
      setCost(hdr.amount || 0);
      setDescription(hdr.description || '');
      if (hdr.purchased_at) setExpenseDate(hdr.purchased_at.split('T')[0]);
      const sub = hdr.category_name || '';
      const main = hdr.main_category_name || findMainCategory(sub);
      setMainCategory(main);
      if (sub && CATEGORY_GROUPS[main].includes(sub)) setSubcategory(sub); else setSubcategory(CATEGORY_GROUPS[main][0]);
    } catch (e) {
      setMessage('Failed to parse receipt');
    }
  };

  const reconcileOk = () => {
    if (!draft) return true;
    const subtotal = draft.items.reduce((s: number, it: any) => s + (it.line_total || 0), 0);
    const { tax = 0, tip = 0, discount = 0 } = draft.header;
    return Math.abs(subtotal + tax + tip - discount - cost) <= 0.02;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const user = localStorage.getItem('vs_user');
    if (!user) {
      setMessage('Please login first.');
      return;
    }
    try {
      setSaving(true);
      if (draft && draft.items.length > 0) {
        const payload = {
          user_email: user,
          header: {
            ...draft.header,
            amount: cost,
            description,
            category_name: subcategory,
            main_category_name: mainCategory,
            purchased_at: expenseDate,
            fingerprint: draft.fingerprint,
          },
          items: draft.items.map((i: any) => ({ ...i })),
        };
        await addExpenseWithItems(payload);
      } else {
        await addExpense({
          user_id: user,
          date: expenseDate,
          description,
          category: subcategory,
          cost,
        });
      }
      setMessage('Expense added successfully.');
      setDescription('');
      setCost(0);
      setDraft(null);
      setFile(null);
    } catch (err) {
      setMessage('Failed to add expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 600, mx: 'auto', mt: 2, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Add New Expense
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 2 }}>
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={expenseDate}
                onChange={e => {
                  setExpenseDate(e.target.value);
                  if (draft) setDraft({ ...draft, header: { ...draft.header, purchased_at: e.target.value } });
                }}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Cost (USD)"
                type="number"
                value={cost}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setCost(val);
                  if (draft) setDraft({ ...draft, header: { ...draft.header, amount: val } });
                }}
                required
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                label="Description"
                value={description}
                onChange={e => {
                  setDescription(e.target.value);
                  if (draft) setDraft({ ...draft, header: { ...draft.header, description: e.target.value } });
                }}
                required
              />
            </Grid>
            <Grid size={6}>
              <TextField
                select
                fullWidth
                label="Main Category"
                value={mainCategory}
                onChange={handleMainCategoryChange}
              >
                {Object.keys(CATEGORY_GROUPS).map(category => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField
                select
                fullWidth
                label="Subcategory"
                value={subcategory}
                onChange={handleSubcategoryChange}
              >
                {CATEGORY_GROUPS[mainCategory].map(sub => (
                  <MenuItem key={sub} value={sub}>
                    {sub}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={12}>
              <input data-testid="file-input" type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
              <Button onClick={handleParse} disabled={!file} sx={{ ml: 1 }}>
                Parse Receipt
              </Button>
            </Grid>
            {draft && (
              <>
                <Grid size={12}>
                  <Typography variant="subtitle1">Items</Typography>
                </Grid>
                {draft.items.map((item: any, idx: number) => (
                  <Grid key={idx} size={12} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField
                      label="Name"
                      value={item.item_name}
                      onChange={e => {
                        const items = [...draft.items];
                        items[idx].item_name = e.target.value;
                        setDraft({ ...draft, items });
                      }}
                    />
                    <TextField
                      label="Line Total ($)"
                      type="number"
                      value={item.line_total}
                      onChange={e => {
                        const items = [...draft.items];
                        items[idx].line_total = parseFloat(e.target.value) || 0;
                        setDraft({ ...draft, items });
                      }}
                    />
                    <TextField
                      label="Category"
                      value={item.category_name || ''}
                      onChange={e => {
                        const items = [...draft.items];
                        items[idx].category_name = e.target.value;
                        setDraft({ ...draft, items });
                      }}
                    />
                    <Button
                      onClick={() => {
                        const items = draft.items.filter((_: any, i: number) => i !== idx);
                        setDraft({ ...draft, items });
                      }}
                    >
                      Delete
                    </Button>
                  </Grid>
                ))}
                <Grid size={12}>
                  <Button
                    onClick={() => {
                      const items = [
                        ...draft.items,
                        {
                          line_no: draft.items.length + 1,
                          item_name: '',
                          line_total: 0,
                          category_name: '',
                        },
                      ];
                      setDraft({ ...draft, items });
                    }}
                  >
                    Add Item
                  </Button>
                </Grid>
                <Grid size={12}>
                  <Typography color={reconcileOk() ? 'green' : 'red'}>
                    {reconcileOk() ? 'Totals match' : 'Totals mismatch'}
                  </Typography>
                </Grid>
              </>
            )}
            <Grid size={12}>
              <Button type="submit" variant="contained" color="primary" fullWidth disabled={saving}>
                {saving ? 'Saving...' : 'Add Expense'}
              </Button>
            </Grid>
            {message && (
              <Grid size={12}>
                <Typography align="center">{message}</Typography>
              </Grid>
            )}
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
};

export default AddExpenseForm;
