import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

const CATEGORY_GROUPS = {
    "Home": ["Rent", "Electronics","Furniture", "Household supplies", "Maintenance", "Mortgage", "Other", "Pets", "Services"],
    "Transportation": ["Gas/fuel", "Car", "Parking", "Plane", "Other", "Bicycle", "Bus/Train", "Taxi", "Hotel"],
    "Food & Drink": ["Groceries", "Dining out", "Liquor", "Other"],
    "Entertainment": ["Movies", "Other", "Games", "Music", "Sports"],
    "Life": ["Medical expenses", "Insurance", "Taxes", "Education", "Childcare", "Clothing", "Gifts", "Other"],
    "Other": ["Services", "General", "Electronics"],
    "Utilities": ["Heat/gas", "Electricity", "Water", "Other", "Cleaning", "Trash", "Other", "TV/Phone/Internet"],
};

const AddExpenseForm: React.FC = () => {
    const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    const [cost, setCost] = useState(0);
    const [mainCategory, setMainCategory] = useState(Object.keys(CATEGORY_GROUPS)[0]);
    const [subcategory, setSubcategory] = useState(CATEGORY_GROUPS[mainCategory as keyof typeof CATEGORY_GROUPS][0]);

    const handleMainCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newMainCategory = e.target.value;
        setMainCategory(newMainCategory);
        setSubcategory(CATEGORY_GROUPS[newMainCategory as keyof typeof CATEGORY_GROUPS][0]);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newExpense = {
            date: expenseDate,
            description,
            cost,
            category: subcategory
        };
        console.log('New Expense:', newExpense);
        // Here you would typically send the data to your backend API
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
                  onChange={e => setExpenseDate(e.target.value)}
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
                  onChange={e => setCost(parseFloat(e.target.value))}
                  required
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  fullWidth
                  label="Description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
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
                    <MenuItem key={category} value={category}>{category}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={6}>
                <TextField
                  select
                  fullWidth
                  label="Subcategory"
                  value={subcategory}
                  onChange={e => setSubcategory(e.target.value)}
                >
                  {CATEGORY_GROUPS[mainCategory as keyof typeof CATEGORY_GROUPS].map(sub => (
                    <MenuItem key={sub} value={sub}>{sub}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={12}>
                <Button type="submit" variant="contained" color="primary" fullWidth>
                  Add Expense
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>
    );
};

export default AddExpenseForm;
