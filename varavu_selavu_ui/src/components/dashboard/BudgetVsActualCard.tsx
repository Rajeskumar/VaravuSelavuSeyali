import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';

interface CategoryTotal { category: string; total: number }

interface Props {
  monthTotal: number;
  categoryTotals: CategoryTotal[];
}

// Shows top category progress as a proxy for Budgets vs Actual.
// If budgets are configured in localStorage ('vs_budgets' mapping), use them; otherwise show share of monthly total.
const BudgetVsActualCard: React.FC<Props> = ({ monthTotal, categoryTotals }) => {
  let budgets: Record<string, number> = {};
  try { budgets = JSON.parse(localStorage.getItem('vs_budgets') || '{}'); } catch {}

  const top = [...categoryTotals].sort((a,b)=>b.total-a.total).slice(0,5);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Budgets vs Actual (month)
        </Typography>
        {top.length === 0 && (
          <Typography color="text.secondary">No category data available.</Typography>
        )}
        {top.map(({ category, total }) => {
          const budget = budgets[category];
          const percent = budget ? Math.min(100, Math.round((total / budget) * 100)) : Math.round((total / (monthTotal || 1)) * 100);
          const subtitle = budget
            ? `$${total.toFixed(2)} of $${budget.toFixed(2)}`
            : `$${total.toFixed(2)} (${percent}% of month)`;
          return (
            <Box key={category} sx={{ mb: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{category}</Typography>
              <LinearProgress variant="determinate" value={isFinite(percent) ? percent : 0} sx={{ height: 8, borderRadius: 4, my: 0.5 }} />
              <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
            </Box>
          );
        })}
        {!Object.keys(budgets).length && (
          <Typography variant="caption" color="text.secondary">
            Tip: set budgets via localStorage key 'vs_budgets' as <code>{'{"Food": 400, "Fuel": 150}'}</code>.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default BudgetVsActualCard;
