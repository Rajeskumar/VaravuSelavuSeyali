import React from 'react';
import { Grid, Card, CardContent, Typography } from '@mui/material';

interface Props {
  totalExpenses: number;
  income: number;
}

const ExpenseSummaryCards: React.FC<Props> = ({ totalExpenses, income }) => (
  <Grid container columns={12} spacing={2}>
    <Grid size={{ xs: 12, sm: 6 }}>
      <Card sx={{
        backdropFilter: 'blur(8px)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,245,248,0.75) 100%)',
        border: '1px solid rgba(255,255,255,0.35)',
        boxShadow: '0 10px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
        borderRadius: 3
      }}>
        <CardContent>
          <Typography variant="h6">💸 Total Expenses</Typography>
          <Typography variant="h4" color="error">${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
        </CardContent>
      </Card>
    </Grid>
    <Grid size={{ xs: 12, sm: 6 }}>
      <Card sx={{
        backdropFilter: 'blur(8px)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(240,255,244,0.75) 100%)',
        border: '1px solid rgba(255,255,255,0.35)',
        boxShadow: '0 10px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
        borderRadius: 3
      }}>
        <CardContent>
          <Typography variant="h6">💰 Income</Typography>
          <Typography variant="h4" color="success.main">${income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
        </CardContent>
      </Card>
    </Grid>
  </Grid>
);

export default ExpenseSummaryCards;
