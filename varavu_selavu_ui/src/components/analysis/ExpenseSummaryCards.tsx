import React from 'react';
import { Grid, Card, CardContent, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { glassCardSx } from '../../theme';

interface Props {
  totalExpenses: number;
  income: number;
}

const ExpenseSummaryCards: React.FC<Props> = ({ totalExpenses, income }) => {
  const theme = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Grid container columns={12} spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{
            ...glassCardSx(theme),
          }}>
            <CardContent>
              <Typography variant="h6">💸 Total Expenses</Typography>
              <Typography variant="h4" color="error">${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{
            ...glassCardSx(theme),
          }}>
            <CardContent>
              <Typography variant="h6">💰 Income</Typography>
              <Typography variant="h4" color="success.main">${income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </motion.div>
  );
};

export default ExpenseSummaryCards;
