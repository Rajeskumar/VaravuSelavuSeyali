import React from 'react';
import { Grid, Card, CardContent, Typography } from '@mui/material';

interface Props {
  totalExpenses: number;
  income: number;
}

const ExpenseSummaryCards: React.FC<Props> = ({ totalExpenses, income }) => (
  <Grid container spacing={2}>
    <Grid size={6}>
      <Card>
        <CardContent>
          <Typography variant="h6">💸 Total Expenses</Typography>
          <Typography variant="h4" color="error">${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
        </CardContent>
      </Card>
    </Grid>
    <Grid size={6}>
      <Card>
        <CardContent>
          <Typography variant="h6">💰 Income</Typography>
          <Typography variant="h4" color="success.main">${income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
        </CardContent>
      </Card>
    </Grid>
  </Grid>
);

export default ExpenseSummaryCards;
