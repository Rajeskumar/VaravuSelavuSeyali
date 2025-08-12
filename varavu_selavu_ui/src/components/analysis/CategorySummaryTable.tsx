import React from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Popover, Box } from '@mui/material';

interface Props {
  categoryTotals: { category: string; total: number }[];
  income: number;
  details?: Record<string, { date: string; description: string; category: string; cost: number }[]>;
}

const CategorySummaryTable: React.FC<Props> = ({ categoryTotals, income, details = {} }) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [hoverCat, setHoverCat] = React.useState<string | null>(null);

  const openPopover = (event: React.MouseEvent<HTMLElement>, category: string) => {
    setAnchorEl(event.currentTarget);
    setHoverCat(category);
  };
  const closePopover = () => {
    setAnchorEl(null);
    setHoverCat(null);
  };

  const rowsForCat = hoverCat ? details[hoverCat] || [] : [];

  return (
    <TableContainer component={Paper} sx={{ width: '100%', overflowX: 'auto', maxWidth: '100vw' }}>
      <Typography variant="h6" sx={{ m: 2 }}>
        % of Income Spent by Category
      </Typography>
      <Table size="small" sx={{ minWidth: 320 }}>
        <TableHead>
          <TableRow>
            <TableCell>Category</TableCell>
            <TableCell align="right">Cost ($)</TableCell>
            <TableCell align="right">% of Income</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {categoryTotals.map((row) => {
            const percent = income > 0 ? (row.total / income) * 100 : 0;
            return (
              <TableRow
                key={row.category}
                onMouseEnter={(e) => openPopover(e as any, row.category)}
                onMouseLeave={closePopover}
                sx={{ cursor: rowsForCat.length ? 'pointer' : 'default', '&:hover': { background: '#f5f5f5' } }}
              >
                <TableCell>{row.category}</TableCell>
                <TableCell align="right">{row.total.toFixed(2)}</TableCell>
                <TableCell align="right">{percent.toFixed(1)}%</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Popover
        open={Boolean(anchorEl) && Boolean(hoverCat)}
        anchorEl={anchorEl}
        onClose={closePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        disableRestoreFocus
        sx={{ maxWidth: '90vw' }}
      >
        <Box sx={{ p: 2, maxWidth: 420 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            {hoverCat} — Expenses
          </Typography>
          {rowsForCat.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No expenses</Typography>
          ) : (
            <Table size="small" sx={{ minWidth: 280 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Cost</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rowsForCat.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell align="right">{r.cost.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      </Popover>
    </TableContainer>
  );
};

export default CategorySummaryTable;
