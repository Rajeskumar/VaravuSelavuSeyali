import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer
} from '@mui/material';
import { formatAppDate } from '../../utils/date';

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
      backdropFilter: 'blur(8px)',
      background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,245,248,0.65) 100%)',
      border: '1px solid rgba(255,255,255,0.35)',
      boxShadow: '0 10px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
      borderRadius: 3,
      animation: 'fadeIn 0.5s ease'
    }}
  >
    <CardContent>
      <Typography variant="h6" gutterBottom>
        Recent Transactions
      </Typography>
      <TableContainer sx={{ overflowX: 'hidden' }}>
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '43%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
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
                <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatAppDate(item.date)}</TableCell>
                <TableCell sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{item.category}</TableCell>
                <TableCell sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{item.description}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }} align="right">${item.cost.toFixed(2)}</TableCell>
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
      </TableContainer>
    </CardContent>
  </Card>
);

export default RecentActivityList;
