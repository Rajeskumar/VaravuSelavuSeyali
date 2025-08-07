import React from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography } from '@mui/material';

const rows = [
  { category: 'Food', cost: 450, percent: 7.3 },
  { category: 'Transport', cost: 250, percent: 4.0 },
  { category: 'Shopping', cost: 200, percent: 3.2 },
  { category: 'Utilities', cost: 150, percent: 2.4 },
  { category: 'Entertainment', cost: 100, percent: 1.6 },
];

const CategorySummaryTable: React.FC = () => (
  <TableContainer component={Paper}>
    <Typography variant="h6" sx={{ m: 2 }}>
      📈 % of Income Spent by Category
    </Typography>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Category</TableCell>
          <TableCell align="right">Cost ($)</TableCell>
          <TableCell align="right">% of Income</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.category}>
            <TableCell>{row.category}</TableCell>
            <TableCell align="right">{row.cost}</TableCell>
            <TableCell align="right">{row.percent.toFixed(1)}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

export default CategorySummaryTable;
