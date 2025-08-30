import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '@mui/material';

interface Activity {
  date: string;
  description: string;
  category: string;
  cost: number;
}

interface Props {
  items: Activity[];
}

const RecentActivityList: React.FC<Props> = ({ items }) => (
  <Card
    sx={{
      height: '100%',
      backdropFilter: 'blur(6px)',
      background: 'rgba(255,255,255,0.4)',
      border: '1px solid rgba(255,255,255,0.2)',
      animation: 'fadeIn 0.5s ease'
    }}
  >
    <CardContent>
      <Typography variant="h6" gutterBottom>
        Recent Transactions
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Category</TableCell>
            <TableCell>Description</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.date}-${item.description}`}>
              <TableCell>{new Date(item.date).toLocaleDateString()}</TableCell>
              <TableCell>{item.category}</TableCell>
              <TableCell>{item.description}</TableCell>
              <TableCell align="right">${item.cost.toFixed(2)}</TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} align="center">
                <Typography color="text.secondary">No recent transactions</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

export default RecentActivityList;
