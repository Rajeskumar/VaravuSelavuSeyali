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
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { formatAppDate } from '../../utils/date';
import { glassCardSx } from '../../theme';

interface Activity {
  date: string;
  description: string;
  category: string;
  cost: number;
}

interface Props {
  items: Activity[];
}

const RecentActivityList: React.FC<Props> = ({ items }) => {
  const theme = useTheme();
  return (
  <motion.div
    initial={{ opacity: 0, y: 32 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
  >
  <Card
    sx={{
      ...glassCardSx(theme),
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
  </motion.div>
  );
};

export default RecentActivityList;
