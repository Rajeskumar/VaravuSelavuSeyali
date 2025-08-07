import React from 'react';
import { Grid, Card, CardContent, Typography } from '@mui/material';

const ExpenseSummaryCards: React.FC = () => (
  <Grid container spacing={2}>
    <Grid size={6}>
      <Card>
        <CardContent>
          <Typography variant="h6">💸 Total Expenses</Typography>
          <Typography variant="h4" color="error">$1,234.56</Typography>
        </CardContent>
      </Card>
    </Grid>
    <Grid size={6}>
      <Card>
        <CardContent>
          <Typography variant="h6">💰 Income</Typography>
          <Typography variant="h4" color="success.main">$6,200.00</Typography>
        </CardContent>
      </Card>
    </Grid>
  </Grid>
);

export default ExpenseSummaryCards;
